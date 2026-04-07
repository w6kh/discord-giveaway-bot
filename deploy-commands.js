require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Claim your giveaway reward')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Type of reward')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('redeem')
    .setDescription('Redeem your claim code')
    .addStringOption(option =>
      option.setName('code')
        .setDescription('Your code')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('View all bot commands'),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Check your submission status'),

  new SlashCommandBuilder()
    .setName('lookup')
    .setDescription('Lookup a user submission')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to lookup')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('forceapprove')
    .setDescription('Force approve a submission')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to approve')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View bot statistics')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log('Registering slash commands...');

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log('✅ Slash commands registered successfully.');
  } catch (error) {
    console.error(error);
  }
})();
