require('dotenv').config();
const fs = require('fs');
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Events
} = require('discord.js');

const config = require('./config.json');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: ['CHANNEL']
});

// ===== RATE LIMIT =====
const claimCooldown = new Map();
const COOLDOWN_MS = 60 * 1000;

// ===== SUBMISSIONS PERSISTENCE =====
function loadSubmissions() {
  if (!fs.existsSync('./submissions.json')) return {};
  return JSON.parse(fs.readFileSync('./submissions.json'));
}

function saveSubmissions(data) {
  fs.writeFileSync('./submissions.json', JSON.stringify(data, null, 2));
}

const submissions = new Map(Object.entries(loadSubmissions()));

// ===== CODES SYSTEM (UPDATED STRUCTURE) =====
function loadCodes() {
  if (!fs.existsSync('./codes.json')) return {};
  return JSON.parse(fs.readFileSync('./codes.json'));
}

function saveCodes(data) {
  fs.writeFileSync('./codes.json', JSON.stringify(data, null, 2));
}

function generateCode(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ===== AUDIT LOGGING =====
async function logAction({ userId, action, moderatorTag }) {
  const logChannel = client.channels.cache.get(config.logChannelId);
  if (!logChannel) return;

  await logChannel.send(
`📄 **Submission ${action.toUpperCase()}**

User: <@${userId}>
Action: ${action}
Moderator: ${moderatorTag}
Time: ${new Date().toLocaleString()}`
  );
}

// ===== AUTO DETECT & FORWARD DM SUBMISSIONS =====
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (message.guild) return;

  const content = message.content.toLowerCase();

  if (submissions.has(message.author.id)) return;

  const isSubmission =
    content.includes('discord username') ||
    content.includes('roblox username') ||
    content.includes('gift card') ||
    content.includes('delivery notes') ||
    content.includes('amount you won');

  if (!isSubmission) return;

  const staffChannel = client.channels.cache.get(config.staffChannelId);
  if (!staffChannel) return;

  const embed = new EmbedBuilder()
    .setTitle('📩 Auto Submission Received')
    .addFields(
      { name: 'User', value: `<@${message.author.id}>`, inline: true },
      { name: 'Status', value: '🟡 Pending', inline: true }
    )
    .setDescription(`\`\`\`\n${message.content}\n\`\`\``)
    .setColor(0xF1C40F);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`approve_${message.author.id}`)
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`reject_${message.author.id}`)
      .setLabel('Reject')
      .setStyle(ButtonStyle.Danger)
  );

  const sentMsg = await staffChannel.send({
    embeds: [embed],
    components: [row]
  });

  submissions.set(message.author.id, {
    content: message.content,
    status: 'pending',
    messageId: sentMsg.id
  });

  saveSubmissions(Object.fromEntries(submissions));
});

// ===== INTERACTIONS =====
client.on('interactionCreate', async interaction => {

  // ================= BUTTONS =================
  if (interaction.isButton()) {
    const [action, userId] = interaction.customId.split('_');
    const submission = submissions.get(userId);

    if (!submission) {
      return interaction.reply({
        content: 'Submission not found (possibly after restart).',
        ephemeral: true
      });
    }

    if (action === 'approve') {
      submission.status = 'approved';

      const embed = EmbedBuilder.from(interaction.message.embeds[0])
        .setFields(
          { name: 'User', value: `<@${userId}>`, inline: true },
          { name: 'Status', value: '🟢 Approved', inline: true }
        )
        .setColor(0x2ECC71);

      await interaction.message.edit({
        embeds: [embed],
        components: []
      });

      await logAction({
        userId,
        action: 'approved',
        moderatorTag: interaction.user.tag
      });

      await interaction.reply({ content: 'Submission approved.', ephemeral: true });
    }

    if (action === 'reject') {
      submission.status = 'denied';

      const embed = EmbedBuilder.from(interaction.message.embeds[0])
        .setFields(
          { name: 'User', value: `<@${userId}>`, inline: true },
          { name: 'Status', value: '🔴 Denied', inline: true }
        )
        .setColor(0xE74C3C);

      await interaction.message.edit({
        embeds: [embed],
        components: []
      });

      await logAction({
        userId,
        action: 'rejected',
        moderatorTag: interaction.user.tag
      });

      await interaction.reply({ content: 'Submission rejected.', ephemeral: true });
    }

    saveSubmissions(Object.fromEntries(submissions));
    return;
  }

  // ================= SLASH COMMANDS =================
  if (!interaction.isChatInputCommand()) return;

  // ===== HELP =====
  if (interaction.commandName === 'help') {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('Bot Commands')
          .setDescription(`/claim ↠ Claim your giveaway reward
/redeem ↠ Redeem your claim code
/help ↠ View all bot commands
/status ↠ Check submission status
/lookup ↠ Lookup a user submission
/forceapprove ↠ Force approve a submission
/stats ↠ View bot statistics`)
          .setColor(0x5865F2)
      ],
      ephemeral: true
    });
  }

  const member = interaction.member;
  const hasRole = member.roles.cache.has(config.winnerRoleId);

  // ===== STATUS (UPDATED: BY CODE) =====
  if (interaction.commandName === 'status') {
    const code = interaction.options.getString('code');
    const codes = loadCodes();

    const entry = codes[code];

    if (!entry) {
      return interaction.reply({ content: '❌ Invalid code.', ephemeral: true });
    }

    return interaction.reply({
      content:
        `📦 Code: **${code}**\n` +
        `👤 User: <@${entry.userId}>\n` +
        `📊 Status: ${entry.used ? 'USED' : 'VALID'}\n` +
        `🎯 Type: ${entry.type || 'N/A'}`,
      ephemeral: true
    });
  }

  // ===== LOOKUP =====
  if (interaction.commandName === 'lookup') {
    const user = interaction.options.getUser('user');
    const submission = submissions.get(user.id);

    if (!submission) {
      return interaction.reply({ content: 'No submission found for this user.', ephemeral: true });
    }

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('User Lookup')
          .addFields(
            { name: 'User', value: `<@${user.id}>`, inline: true },
            { name: 'Status', value: submission.status, inline: true }
          )
          .setDescription(`\`\`\`\n${submission.content}\n\`\`\``)
          .setColor(0x3498DB)
      ],
      ephemeral: true
    });
  }

  // ===== FORCE APPROVE =====
  if (interaction.commandName === 'forceapprove') {
    const user = interaction.options.getUser('user');
    const submission = submissions.get(user.id);

    if (!submission) {
      return interaction.reply({ content: 'No submission found.', ephemeral: true });
    }

    submission.status = 'approved';
    saveSubmissions(Object.fromEntries(submissions));

    await logAction({
      userId: user.id,
      action: 'force approved',
      moderatorTag: interaction.user.tag
    });

    return interaction.reply({
      content: `Approved <@${user.id}> successfully.`,
      ephemeral: true
    });
  }

  // ===== STATS (UPDATED) =====
  if (interaction.commandName === 'stats') {
    const codes = loadCodes();

    const totalCodes = Object.keys(codes).length;
    const usedCodes = Object.values(codes).filter(c => c.used).length;

    const pendingSubs = [...submissions.values()].filter(s => s.status === 'pending').length;
    const approvedSubs = [...submissions.values()].filter(s => s.status === 'approved').length;
    const deniedSubs = [...submissions.values()].filter(s => s.status === 'denied').length;

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('Bot Statistics')
          .addFields(
            { name: 'Total Codes', value: `${totalCodes}`, inline: true },
            { name: 'Redeemed Codes', value: `${usedCodes}`, inline: true },
            { name: 'Pending', value: `${pendingSubs}`, inline: true },
            { name: 'Approved', value: `${approvedSubs}`, inline: true },
            { name: 'Denied', value: `${deniedSubs}`, inline: true }
          )
          .setColor(0x5865F2)
      ],
      ephemeral: true
    });
  }

  // ===== CLAIM (UPDATED: LOGGING STRUCTURE) =====
  if (interaction.commandName === 'claim') {
    try {
      const now = Date.now();
      const lastClaim = claimCooldown.get(interaction.user.id);

      if (lastClaim && now - lastClaim < COOLDOWN_MS) {
        const remaining = Math.ceil((COOLDOWN_MS - (now - lastClaim)) / 1000);
        return interaction.reply({
          content: `Please wait ${remaining}s before using /claim again.`,
          ephemeral: true
        });
      }

      claimCooldown.set(interaction.user.id, now);

      if (!hasRole) {
        return interaction.reply({
          content: 'Access denied. Winner role not detected.',
          ephemeral: true
        });
      }

      const type = interaction.options.getString('type');
      if (!type) {
        return interaction.reply({
          content: 'Missing required option: type',
          ephemeral: true
        });
      }

      const code = generateCode();
      const codes = loadCodes();

      // STORE AS OBJECT KEYED BY CODE
      codes[code] = {
        userId: interaction.user.id,
        type,
        used: false,
        createdAt: Date.now()
      };

      saveCodes(codes);

      await interaction.user.send(
`You claimed your ${type} giveaway!

Key: ${code}

Use /redeem ${code} to continue.`
      ).catch(() => {});

      return interaction.reply({
        content: 'Check your DMs for your code.',
        ephemeral: true
      });

    } catch (err) {
      console.error("CLAIM ERROR:", err);

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'An error occurred.', ephemeral: true });
      } else {
        await interaction.reply({ content: 'An error occurred.', ephemeral: true });
      }
    }
  }

  // ===== REDEEM =====
  if (interaction.commandName === 'redeem') {
    const codeInput = interaction.options.getString('code');
    const codes = loadCodes();

    const entry = codes[codeInput];

    if (!entry) {
      return interaction.reply({ content: 'Invalid code.', ephemeral: true });
    }

    if (entry.userId !== interaction.user.id) {
      return interaction.reply({ content: 'This is not your code.', ephemeral: true });
    }

    if (entry.used) {
      return interaction.reply({ content: 'Code already used.', ephemeral: true });
    }

    entry.used = true;
    saveCodes(codes);

    await interaction.user.send('Redeem instructions sent.');
    await interaction.reply({ content: 'Check your DMs for instructions.', ephemeral: true });

    await interaction.member.roles.remove(config.winnerRoleId);
  }

});

client.login(process.env.TOKEN);
