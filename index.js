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

  // Prevent duplicate submissions
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

// ===== BUTTON HANDLER =====
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;

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
});

// ===== DATABASE =====
function loadCodes() {
  if (!fs.existsSync('./codes.json')) return [];
  return JSON.parse(fs.readFileSync('./codes.json'));
}

function saveCodes(data) {
  fs.writeFileSync('./codes.json', JSON.stringify(data, null, 2));
}

// ===== CODE GENERATOR =====
function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ===== COMMANDS =====
const commands = [
  new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Claim your giveaway reward')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Reward type')
        .setRequired(true)
        .addChoices(
          { name: 'Robux', value: 'robux' },
          { name: 'Nitro', value: 'nitro' },
          { name: 'Giftcard', value: 'giftcard' }
        )
    ),

  new SlashCommandBuilder()
    .setName('redeem')
    .setDescription('Redeem your code')
    .addStringOption(option =>
      option.setName('code')
        .setDescription('Your code')
        .setRequired(true)
    )
].map(cmd => cmd.toJSON());

// ===== REGISTER COMMANDS =====
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log('🔄 Registering commands...');
    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: commands }
    );
    console.log('✅ Commands registered.');
  } catch (err) {
    console.error(err);
  }
})();

// ===== READY =====
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  client.user.setPresence({
    status: 'online',
    activities: [
      {
        name: 'Claiming giveaways in /uhg',
        type: 1, // 1 = STREAMING
        url: 'https://twitch.tv/x6cs' // required for streaming
      }
    ]
  });
});


// ===== INTERACTIONS =====
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const member = interaction.member;
  const hasRole = member.roles.cache.has(config.winnerRoleId);

  // ===== CLAIM =====
  if (interaction.commandName === 'claim') {

    // cooldown
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
    const code = generateCode();

    const codes = loadCodes();

    codes.push({
      code,
      userId: interaction.user.id,
      type,
      used: false
    });

    saveCodes(codes);

    let claimMessage = '';

    if (type === 'robux') {
      claimMessage =
`**You claimed your Robux giveaway! Congrats**

**__Key:__** \`\` ${code} \`\`

Go back into the server, type /redeem ${code} to continue claiming your giveaway!`;
    }

    if (type === 'nitro') {
      claimMessage =
`**You claimed your Nitro giveaway! Congrats**

**__Key:__** \`\` ${code} \`\`

Go back into the server, type /redeem ${code} to continue claiming your giveaway!`;
    }

    if (type === 'giftcard') {
      claimMessage =
`**You claimed your Giftcard giveaway! Congrats**

**__Key:__** \`\` ${code} \`\`

Go back into the server, type /redeem ${code} to continue claiming your giveaway!`;
    }

    try {
      await interaction.user.send(claimMessage);

      await interaction.reply({
        content: 'Check your DMs for your code.',
        ephemeral: true
      });

    } catch {
      await interaction.reply({
        content: 'Enable DMs to receive your code.',
        ephemeral: true
      });
    }
  }

  // ===== REDEEM =====
  if (interaction.commandName === 'redeem') {
    const codeInput = interaction.options.getString('code');
    const codes = loadCodes();

    const entry = codes.find(c => c.code === codeInput);

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

    let template = '';

    if (entry.type === 'robux') {
      template =
`**You successfully redeemed your Robux!**

Your Roblox username: 

The amount you won:

Gamepass link:

[If you don't know how to make a gamepass](https://youtube.com/shorts/IMFBbgoRNqY)`;
    }

    if (entry.type === 'nitro') {
      template =
`**Nitro Redeemed Successfully!** 

\`\` Please confirm your Discord username below so we can process your $10 Nitro gift \`\`

Discord Username:

Delivery Notes?:`;
    }

    if (entry.type === 'giftcard') {
      template =
`Congratulations — your gift card has been claimed!

Please confirm the details below so we can send your code 

Discord username:

Gift card type:

Amount:`;
    }

    await interaction.user.send(template);

    await interaction.reply({
      content: 'Check your DMs for instructions.',
      ephemeral: true
    });

    await interaction.member.roles.remove(config.winnerRoleId);
  }
});

client.login(process.env.TOKEN);
