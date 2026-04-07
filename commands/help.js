const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('View all bot commands'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('Bot Commands')
      .setDescription(`
/claim ↠ Claim your giveaway reward
/redeem ↠ Redeem your claim code
/help ↠ View all bot commands
/status ↠ Check submission status
/lookup ↠ Lookup a user submission
/forceapprove ↠ Force approve a submission
/stats ↠ View bot statistics`)
      .setColor(0x5865F2);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
