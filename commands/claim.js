const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const config = require('../config.json');

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

const claimCooldown = new Map();
const COOLDOWN_MS = 60 * 1000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Claim your giveaway reward')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Type of reward')
        .setRequired(true)
    ),

  async execute(interaction) {
    const member = interaction.member;
    const hasRole = member.roles.cache.has(config.winnerRoleId);

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

    await interaction.reply({
      content: 'Check your DMs for your code.',
      ephemeral: true
    });
  }
};
