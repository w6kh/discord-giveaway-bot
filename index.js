require('dotenv').config();
const fs = require('fs');
const {
  Client,
  GatewayIntentBits,
  Collection,
  Events
} = require('discord.js');

const config = require('./config.json');
const { loadCommands } = require('./handlers/commandHandler');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: ['CHANNEL']
});

// Load commands
loadCommands(client);

// ===== INTERACTION HANDLER =====
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, client);
  } catch (err) {
    console.error(err);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'Error executing command.', ephemeral: true });
    } else {
      await interaction.reply({ content: 'Error executing command.', ephemeral: true });
    }
  }
});

client.login(process.env.TOKEN);
