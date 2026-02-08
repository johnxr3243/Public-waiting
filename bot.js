const { Client, GatewayIntentBits, EmbedBuilder, ChannelType, PermissionsBitField, SlashCommandBuilder, REST, Routes } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, NoSubscriberBehavior, AudioPlayerStatus, entersState, VoiceConnectionStatus, StreamType } = require('@discordjs/voice');
const fs = require('fs');
const path = require('path');

// إعداد مكتبة الصوت
try {
    require('@discordjs/opus');
    console.log('✅ مكتبة الصوت جاهزة باستخدام @discordjs/opus');
} catch (e1) {
    try {
        const OpusScript = require('opusscript');
        const encoder = new OpusScript(48000, 2, OpusScript.Application.AUDIO);
        console.log('✅ مكتبة الصوت جاهزة باستخدام opusscript');
    } catch (e2) {
        console.warn('⚠️  لا توجد مكتبة opus متاحة:', e1.message, '/', e2.message);
    }
}

// الإعدادات الأساسية
const config = {
    token: process.env.DISCORD_TOKEN
};

// إضافة معرف المالك
const BOT_OWNER_ID = '1423320282281676878';
const OWNER_PREFIX = '!';

// ملف الإعدادات
const SETTINGS_FILE = 'settings.json';

// دالة لتحميل الإعدادات
function loadSettings() {
    if (fs.existsSync(SETTINGS_FILE)) {
        const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
        return JSON.parse(data);
    }
    return {};
}

// دالة لحفظ الإعدادات
function saveSettings(settings) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// تحميل الإعدادات الحالية
const serverSettings = loadSettings();

// تعريف مجموعات الصوت
const audioSets = [
    {
        id: 'set1',
        name: 'الطقم الأول',
        waiting: 'waiting_call.mp3',
        background: 'background_music.mp3'
    },
    {
        id: 'set2',
        name: 'الطقم الثاني',
        waiting: 'waiting2_call.mp3',
        background: 'background2_music.mp3'
    },
    {
        id: 'set3',
        name: 'طقم بدون انتظار',
        waiting: null,
        background: 'background_music.mp3'
    }
];

// دالة للتحقق من اكتمال إعدادات السيرفر
function isServerSetupComplete(guildId) {
    const settings = serverSettings[guildId];
    if (!settings) return false;
    
    // مطلوب: category, voice, text, role
    return settings.categoryId && settings.voiceId && settings.textId && settings.adminRoleId;
}

// دالة للحصول على إعدادات سيرفر معين
function getServerSettings(guildId) {
    return serverSettings[guildId];
}

// دالة للحصول على مجموعة صوتية بالـ ID
function getAudioSetById(audioSetId) {
    return audioSets.find(set => set.id === audioSetId) || audioSets[0];
}

// دالة لعرض الإعدادات بشكل جميل
function formatSettings(guild, settings) {
    const audioSet = getAudioSetById(settings.audioSetId || 'set1');
    
    // محاولة جلب أسماء القنوات والرتب
    let categoryName = '❌ غير محدد';
    let voiceName = '❌ غير محدد';
    let textName = '❌ غير محدد';
    let roleName = '❌ غير محدد';
    
    try {
        if (settings.categoryId) {
            const category = guild.channels.cache.get(settings.categoryId);
            categoryName = category ? category.name : '❌ قناة غير موجودة';
        }
        
        if (settings.voiceId) {
            const voice = guild.channels.cache.get(settings.voiceId);
            voiceName = voice ? voice.name : '❌ قناة غير موجودة';
        }
        
        if (settings.textId) {
            const text = guild.channels.cache.get(settings.textId);
            textName = text ? text.name : '❌ قناة غير موجودة';
        }
        
        if (settings.adminRoleId) {
            const role = guild.roles.cache.get(settings.adminRoleId);
            roleName = role ? role.name : '❌ رتبة غير موجودة';
        }
    } catch (error) {
        console.log('خطأ في جلب البيانات:', error);
    }
    
    return `
**🎛️ إعدادات نظام الدعم**

**📂 التصنيف:** ${categoryName} \`(${settings.categoryId || 'غير محدد'})\`
**🎧 روم الانتظار:** ${voiceName} \`(${settings.voiceId || 'غير محدد'})\`
**💬 روم الإشعارات:** ${textName} \`(${settings.textId || 'غير محدد'})\`
**👑 رتبة الإدارة:** ${roleName} \`(${settings.adminRoleId || 'غير محدد'})\`
**🎵 مجموعة الصوت:** ${audioSet.name}

**📊 حالة الإعدادات:** ${isServerSetupComplete(guild.id) ? '✅ مكتملة' : '❌ غير مكتملة'}

**📝 طريقة الاستخدام:**
1. العميل يدخل روم الانتظار
2. البوت يشغل موسيقى انتظار
3. يرسل إشعار في روم الإشعارات
4. المشرف (اللي معاه الرتبة) يدخل روم الانتظار
5. ينشئ البوت روم خاص وينقل الجميع إليه
    `;
}

// دالة للتحذير إذا النظام غير مكتمل
async function warnAdminIfNotSetup(guild) {
    const settings = getServerSettings(guild.id);
    if (!isServerSetupComplete(guild.id)) {
        // البحث عن الإدمن الأول
        const admin = guild.members.cache.find(member => 
            member.permissions.has(PermissionsBitField.Flags.Administrator)
        );
        
        if (admin) {
            try {
                await admin.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xe74c3c)
                            .setTitle('⚠️ تنبيه مهم!')
                            .setDescription(`**نظام الدعم في ${guild.name} غير مكتمل الإعداد!**\n\nالرجاء استخدام الأمر \`/help\` في سيرفر ${guild.name} لعرض أوامر الإعداد.`)
                            .addFields({
                                name: 'الأوامر الأساسية المطلوبة',
                                value: `\`/setup category\`\n\`/setup voice\`\n\`/setup text\`\n\`/setup role\``
                            })
                            .setFooter({ text: 'البوت لن يعمل بشكل صحيح حتى تكتمل الإعدادات' })
                    ]
                });
                console.log(`📩 تم إرسال تحذير للإدمن في ${guild.name}`);
            } catch (error) {
                console.log(`❌ لم أستطع إرسال رسالة للإدمن في ${guild.name}`);
            }
        }
    }
}

// ================ البوت الأساسي ================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// تعريف الـ Slash Commands
const commands = [
    new SlashCommandBuilder()
        .setName('setup')
        .setDescription('إعدادات نظام الدعم الصوتي')
        .addSubcommand(subcommand =>
            subcommand
                .setName('category')
                .setDescription('تحديد التصنيف للغرف الخاصة')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('ID التصنيف')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('voice')
                .setDescription('تحديد روم الانتظار الصوتي')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('ID روم الصوت')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('text')
                .setDescription('تحديد روم إرسال الإشعارات')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('ID روم النص')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('role')
                .setDescription('تحديد رتبة الإدارة')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('ID الرتبة')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('waiting')
                .setDescription('اختيار مجموعة الصوت')
                .addStringOption(option =>
                    option.setName('set')
                        .setDescription('اختر مجموعة الصوت')
                        .setRequired(true)
                        .addChoices(
                            { name: 'الطقم الأول', value: 'set1' },
                            { name: 'الطقم الثاني', value: 'set2' },
                            { name: 'طقم بدون انتظار', value: 'set3' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('show')
                .setDescription('عرض الإعدادات الحالية')),
    new SlashCommandBuilder()
        .setName('reset')
        .setDescription('مسح كل الإعدادات'),
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('عرض كل الأوامر المتاحة')
].map(command => command.toJSON());

// تخزين البيانات
const activeCalls = new Map();
const voiceConnections = new Map();
const privateRooms = new Map();
const guildAudioIndex = new Map();

// دالة لاختيار مجموعة صوت
function getNextAudioSet(guildId) {
    const settings = getServerSettings(guildId);
    if (!settings || !settings.audioSetId) return audioSets[0];
    
    const audioSet = getAudioSetById(settings.audioSetId);
    
    if (!audioSet.waiting) {
        return audioSet;
    }
    
    if (!guildAudioIndex.has(guildId)) {
        guildAudioIndex.set(guildId, 0);
    }
    
    const availableSets = audioSets.filter(set => set.waiting);
    const index = guildAudioIndex.get(guildId) % availableSets.length;
    const selected = availableSets[index];
    guildAudioIndex.set(guildId, (index + 1) % availableSets.length);
    
    return selected;
}

// دالة لإنشاء اتصال صوتي
async function getOrCreateConnection(channel) {
    try {
        const guildId = channel.guild.id;
        
        if (voiceConnections.has(guildId)) {
            const conn = voiceConnections.get(guildId);
            try {
                if (conn && conn.state && conn.state.status !== VoiceConnectionStatus.Destroyed) {
                    return conn;
                }
            } catch (err) {}
        }

        console.log(`🔊 إنشاء اتصال صوتي جديد في ${channel.name}`);
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: guildId,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        });

        voiceConnections.set(guildId, connection);
        return connection;
        
    } catch (error) {
        console.error('❌ خطأ في الاتصال الصوتي:', error);
        return null;
    }
}

// دالة تشغيل الصوت
function playAudio(connection, fileName, userId, shouldLoop = false, audioSet = null) {
    try {
        const soundPath = path.join(__dirname, fileName);
        if (!fs.existsSync(soundPath)) {
            console.log(`❌ ملف ${fileName} مش موجود`);
            return null;
        }

        const input = fs.createReadStream(soundPath);
        const resource = createAudioResource(input, {
            inputType: StreamType.Arbitrary,
            inlineVolume: true
        });

        const player = createAudioPlayer({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Pause
            }
        });

        player.play(resource);
        try { connection.subscribe(player); } catch (err) { console.warn('⚠️ فشل الاشتراك بالمشغل:', err.message); }

        if (shouldLoop) {
            player.on(AudioPlayerStatus.Idle, () => {
                if (activeCalls.has(userId)) {
                    const callData = activeCalls.get(userId);
                    if (!callData.isBotMuted && callData.audioSet) {
                        console.log(`🔄 تكرار موسيقى ${callData.audioSet.name} للعميل ${userId}`);
                        playAudio(connection, callData.audioSet.background, userId, true, callData.audioSet);
                    } else if (!callData || !callData.audioSet) {
                        playAudio(connection, fileName, userId, true, audioSet);
                    }
                }
            });
        }

        return player;

    } catch (error) {
        console.error(`❌ خطأ في تشغيل ${fileName}:`, error);
        return null;
    }
}

// دالة لوقف الصوت
function stopAllAudioForUser(userId) {
    const callData = activeCalls.get(userId);
    if (!callData) return;
    
    if (callData.musicPlayer) {
        callData.musicPlayer.stop();
    }
    if (callData.waitingPlayer) {
        callData.waitingPlayer.stop();
    }
}

// دالة لإنشاء روم صوتي خاص
async function createPrivateVoiceRoom(guild, settings, userId, clientName, adminId, adminName) {
    try {
        console.log(`🆕 إنشاء روم صوتي خاص للعميل ${clientName}`);
        
        let category;
        try {
            category = await guild.channels.fetch(settings.categoryId);
        } catch (error) {
            category = null;
        }
        
        const cleanClientName = clientName.replace(/[^\w\u0600-\u06FF]/g, '-').substring(0, 15);
        const roomNumber = Math.floor(Math.random() * 1000);
        
        const voiceChannel = await guild.channels.create({
            name: `Supp-${cleanClientName}-${roomNumber}`,
            type: ChannelType.GuildVoice,
            parent: category ? category.id : null,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect]
                },
                {
                    id: userId,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak]
                },
                {
                    id: adminId,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak, PermissionsBitField.Flags.MoveMembers]
                },
                {
                    id: settings.adminRoleId,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak]
                }
            ]
        });
        
        console.log(`✅ تم إنشاء الروم: ${voiceChannel.name}`);
        return voiceChannel;
        
    } catch (error) {
        console.error('❌ خطأ في إنشاء الروم الخاص:', error);
        return null;
    }
}

// دالة لنقل الأعضاء للروم الخاص
async function moveToPrivateRoom(guild, userId, adminId, privateRoomId) {
    try {
        console.log(`🚚 نقل الأعضاء للروم الخاص`);
        
        const privateRoom = await guild.channels.fetch(privateRoomId);
        if (!privateRoom) {
            throw new Error('❌ الروم الخاص مش موجود');
        }
        
        // نقل العميل
        const clientMember = await guild.members.fetch(userId);
        if (clientMember.voice.channel) {
            await clientMember.voice.setChannel(privateRoomId);
            console.log(`✅ تم نقل العميل ${clientMember.user.tag}`);
        }
        
        // نقل المشرف
        const adminMember = await guild.members.fetch(adminId);
        if (adminMember.voice.channel) {
            await adminMember.voice.setChannel(privateRoomId);
            console.log(`✅ تم نقل المشرف ${adminMember.user.tag}`);
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ خطأ في نقل الأعضاء:', error);
        return false;
    }
}

// دالة لحذف الروم الخاص
async function deletePrivateRoom(guild, roomId) {
    try {
        const room = await guild.channels.fetch(roomId);
        if (room) {
            await room.delete('انتهت المكالمة');
            console.log(`🗑️ تم حذف الروم الخاص: ${room.name}`);
            return true;
        }
    } catch (error) {
        return false;
    }
}

// دالة لإرسال إشعار طلب جديد
async function sendNewCallNotification(guild, settings, userId, userName) {
    try {
        const textChannel = await guild.channels.fetch(settings.textId);
        if (!textChannel) return;
        
        const embed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle('📞 طلب دعم صوتي جديد')
            .setDescription(`**يوجد عميل في انتظار الدعم**`)
            .addFields(
                { name: '👤 العميل', value: `${userName}\n<@${userId}>`, inline: true },
                { name: '🕐 الوقت', value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true },
                { name: '📍 المكان', value: `<#${settings.voiceId}>`, inline: true }
            )
            .setFooter({ text: 'الرجاء التوجه للروم الصوتي لتولي الطلب' })
            .setTimestamp();
        
        await textChannel.send({
            content: `<@&${settings.adminRoleId}> 📢 عميل في انتظار الدعم!`,
            embeds: [embed]
        });
        
        console.log(`📤 تم إرسال إشعار طلب جديد للعميل ${userName}`);
        
    } catch (error) {
        console.error('❌ خطأ في إرسال إشعار الطلب:', error);
    }
}

// دالة لإرسال إشعار استلام الطلب
async function sendAdminAcceptNotification(guild, settings, userId, adminId, adminName, clientName) {
    try {
        const textChannel = await guild.channels.fetch(settings.textId);
        if (!textChannel) return;
        
        const embed = new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle('✅ تم استلام الطلب')
            .setDescription(`**تم تولي طلب الدعم بنجاح**`)
            .addFields(
                { name: '👤 العميل', value: `${clientName}\n<@${userId}>`, inline: true },
                { name: '👑 المشرف', value: `${adminName}\n<@${adminId}>`, inline: true },
                { name: '⏰ الوقت', value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true }
            )
            .setTimestamp();
        
        await textChannel.send({ 
            content: `📢 **تم استلام الطلب**\nالمشرف <@${adminId}> استلم طلب <@${userId}>`,
            embeds: [embed] 
        });
        
        console.log(`📤 تم إرسال إشعار استلام الطلب`);
        
    } catch (error) {
        console.error('❌ خطأ في إرسال إشعار الاستلام:', error);
    }
}

// دالة للتحقق من وجود مشرف في الروم
function getAdminInVoice(channel, settings) {
    if (!channel || !settings || !settings.adminRoleId) return null;
    
    // فقط الرتبة المحددة في الإعدادات
    return channel.members.find(member => 
        member.roles.cache.has(settings.adminRoleId) && 
        !member.user.bot
    );
}

// دالة للتحقق من صلاحيات استخدام الأوامر
function canUseSetupCommands(member, guild, settings) {
    // 1. Owner للسيرفر
    if (guild.ownerId === member.id) return true;
    
    // 2. عنده Admin Permission
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    
    // 3. عنده الرتبة المحددة للإدارة (إذا تم إعدادها)
    if (settings?.adminRoleId && member.roles.cache.has(settings.adminRoleId)) return true;
    
    return false;
}

// دالة لتسجيل الـ Slash Commands
async function registerCommands() {
    try {
        const rest = new REST({ version: '10' }).setToken(config.token);
        
        console.log('🔄 جاري تسجيل الـ Slash Commands...');
        
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        
        console.log('✅ تم تسجيل الـ Slash Commands بنجاح!');
    } catch (error) {
        console.error('❌ خطأ في تسجيل الـ Slash Commands:', error);
    }
}

// ================ نظام Control Panel للمالك ================

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    
    // فقط المالك يستخدم Prefix Commands
    if (message.author.id !== BOT_OWNER_ID) return;
    
    // التحقق من البادئة
    if (!message.content.startsWith(OWNER_PREFIX)) return;
    
    const args = message.content.slice(OWNER_PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    // أمر panel لعرض لوحة التحكم
    if (command === 'panel') {
        const panelEmbed = new EmbedBuilder()
            .setColor(0x9b59b6)
            .setTitle('👑 لوحة تحكم المالك - بدون حذف تلقائي')
            .setDescription(`**مرحباً ${message.author.username}**\nالبادئة: \`${OWNER_PREFIX}\``)
            .addFields(
                {
                    name: '📊 **أوامر الإحصائيات**',
                    value: `\`${OWNER_PREFIX}stats\` - إحصائيات البوت\n\`${OWNER_PREFIX}servers [صفحة]\` - قائمة السيرفرات (مع ID السيرفر ومالكه)\n\`${OWNER_PREFIX}server <ID>\` - معلومات سيرفر محدد\n\`${OWNER_PREFIX}locklist\` - قائمة السيرفرات المقفلة`
                },
                {
                    name: '📢 **أوامر البث**',
                    value: `\`${OWNER_PREFIX}broadcast <رسالة>\` - إرسال للجميع\n\`${OWNER_PREFIX}dm <ID_السيرفر> <رسالة>\` - إرسال لمالك سيرفر`
                },
                {
                    name: '⚙️ **أوامر التحكم**',
                    value: `\`${OWNER_PREFIX}lock <ID_السيرفر>\` - قفل البوت في سيرفر محدد\n\`${OWNER_PREFIX}unlock <ID_السيرفر>\` - فتح البوت في سيرفر\n\`${OWNER_PREFIX}leave <ID_السيرفر>\` - طلع البوت\n\`${OWNER_PREFIX}clearsettings <ID_السيرفر>\` - مسح إعدادات\n\`${OWNER_PREFIX}clearownerdm\` - مسح الشات الخاص مع المالك`
                },
                {
                    name: '👑 **أوامر عامة**',
                    value: `\`${OWNER_PREFIX}panel\` - عرض هذه اللوحة\n\`${OWNER_PREFIX}help\` - المساعدة`
                }
            )
            .setFooter({ text: `ID المالك: ${BOT_OWNER_ID} | ${client.guilds.cache.size} سيرفر\nالرسالة ماتحذفش تلقائياً - انت قرر متى تحذفها` })
            .setTimestamp();
        
        await message.reply({ embeds: [panelEmbed] });
        return;
    }
    
    // أمر stats
    if (command === 'stats') {
        const totalServers = client.guilds.cache.size;
        const totalMembers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
        const totalActiveCalls = activeCalls.size;
        const totalPrivateRooms = privateRooms.size;
        const completedSetups = client.guilds.cache.filter(g => isServerSetupComplete(g.id)).size;
        
        // السيرفرات المقفلة
        const lockedServers = serverSettings.lockedServers || [];
        const allLockedCount = lockedServers.length; // كل السيرفرات المقفلة حتى اللي البوت مش فيها
        const activeLocked = lockedServers.filter(id => client.guilds.cache.has(id)).length; // بس اللي البوت موجود فيها
        
        const statsEmbed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle('📊 إحصائيات البوت')
            .addFields(
                { name: '🏠 السيرفرات', value: `\`${totalServers}\` سيرفر`, inline: true },
                { name: '👥 الأعضاء', value: `\`${totalMembers.toLocaleString()}\` عضو`, inline: true },
                { name: '✅ الإعدادات المكتملة', value: `\`${completedSetups}\` سيرفر`, inline: true },
                { name: '📞 المكالمات النشطة', value: `\`${totalActiveCalls}\` مكالمة`, inline: true },
                { name: '🔒 الرومات الخاصة', value: `\`${totalPrivateRooms}\` روم`, inline: true },
                { name: '🚫 السيرفرات المقفلة', value: `\`${allLockedCount}\` سيرفر (${activeLocked} موجودة)`, inline: true },
                { name: '🟢 وقت التشغيل', value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true }
            )
            .setFooter({ text: `مالك البوت: ${message.author.tag}` })
            .setTimestamp();
        
        await message.reply({ embeds: [statsEmbed] });
        return;
    }
    
    // أمر servers
    if (command === 'servers') {
        const servers = client.guilds.cache.map(guild => {
            const settings = getServerSettings(guild.id);
            const lockedServers = serverSettings.lockedServers || [];
            const isLocked = lockedServers.includes(guild.id);
            
            return {
                name: guild.name,
                id: guild.id,
                members: guild.memberCount,
                setup: isServerSetupComplete(guild.id) ? '✅' : '❌',
                owner: guild.ownerId,
                locked: isLocked ? '🔒' : '🔓'
            };
        });
        
        const itemsPerPage = 8;
        const totalPages = Math.ceil(servers.length / itemsPerPage);
        
        let page = parseInt(args[0]) || 1;
        if (page < 1) page = 1;
        if (page > totalPages) page = totalPages;
        
        const start = (page - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const currentServers = servers.slice(start, end);
        
        let description = '📋 **قائمة السيرفرات بالتفصيل:**\n\n';
        currentServers.forEach((server, index) => {
            const serverNum = start + index + 1;
            description += `**${serverNum}. ${server.name}**\n`;
            description += `├─ 🆔 **السيرفر:** \`${server.id}\`\n`;
            description += `├─ 👑 **المالك:** <@${server.owner}> (\`${server.owner}\`)\n`;
            description += `├─ 👥 **الأعضاء:** ${server.members.toLocaleString()}\n`;
            description += `├─ ⚙️ **الإعدادات:** ${server.setup}\n`;
            description += `└─ 🔐 **القفل:** ${server.locked}\n\n`;
        });
        
        const serversEmbed = new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle(`🏠 قائمة السيرفرات - الصفحة ${page}/${totalPages}`)
            .setDescription(description || 'لا توجد سيرفرات')
            .addFields({
                name: '📊 إحصائيات مفصلة',
                value: `• **إجمالي السيرفرات:** ${servers.length}\n• **المكتملة:** ${servers.filter(s => s.setup === '✅').length}\n• **الناقصة:** ${servers.filter(s => s.setup === '❌').length}\n• **المقفلة:** ${servers.filter(s => s.locked === '🔒').length}\n• **إجمالي الأعضاء:** ${servers.reduce((acc, s) => acc + s.members, 0).toLocaleString()}`
            })
            .setFooter({ 
                text: `أمر: ${OWNER_PREFIX}servers <رقم الصفحة>\nعرض ${start+1}-${Math.min(end, servers.length)} من ${servers.length}` 
            })
            .setTimestamp();
        
        await message.reply({ embeds: [serversEmbed] });
        return;
    }
    
    // أمر locklist - لعرض قائمة السيرفرات المقفلة فقط
    if (command === 'locklist') {
        const lockedServers = serverSettings.lockedServers || [];
        
        if (lockedServers.length === 0) {
            const locklistEmbed = new EmbedBuilder()
                .setColor(0xf39c12)
                .setTitle('📋 قائمة السيرفرات المقفلة')
                .setDescription('**لا توجد سيرفرات مقفلة حالياً.**')
                .setFooter({ text: 'استخدم !lock <ID> لقفل سيرفر' })
                .setTimestamp();
            
            await message.reply({ embeds: [locklistEmbed] });
            return;
        }
        
        const itemsPerPage = 10;
        const totalPages = Math.ceil(lockedServers.length / itemsPerPage);
        
        let page = parseInt(args[0]) || 1;
        if (page < 1) page = 1;
        if (page > totalPages) page = totalPages;
        
        const start = (page - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const currentLocks = lockedServers.slice(start, end);
        
        let description = '🔒 **قائمة السيرفرات المقفلة:**\n\n';
        
        for (const serverId of currentLocks) {
            const guild = client.guilds.cache.get(serverId);
            
            if (guild) {
                // السيرفر موجود عند البوت
                const owner = await guild.fetchOwner().catch(() => null);
                description += `🔴 **${guild.name}**\n`;
                description += `├─ 🆔 السيرفر: \`${serverId}\`\n`;
                description += `├─ 👑 المالك: ${owner ? `<@${owner.id}> (\`${owner.id}\`)` : 'غير معروف'}\n`;
                description += `├─ 👥 الأعضاء: ${guild.memberCount.toLocaleString()}\n`;
                description += `└─ 📍 البوت موجود في السيرفر\n\n`;
            } else {
                // السيرفر مش موجود عند البوت (خرج البوت منه)
                description += `⚫ **سيرفر غير موجود**\n`;
                description += `├─ 🆔 السيرفر: \`${serverId}\`\n`;
                description += `├─ 👑 المالك: غير معروف\n`;
                description += `├─ 👥 الأعضاء: غير معروف\n`;
                description += `└─ 📍 البوت غير موجود في السيرفر\n\n`;
            }
        }
        
        const locklistEmbed = new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle(`📋 قائمة السيرفرات المقفلة - الصفحة ${page}/${totalPages}`)
            .setDescription(description)
            .addFields({
                name: '📊 إحصائيات القفل',
                value: `• **إجمالي السيرفرات المقفلة:** ${lockedServers.length}\n• **البوت موجود في:** ${lockedServers.filter(id => client.guilds.cache.has(id)).length}\n• **البوت غير موجود في:** ${lockedServers.filter(id => !client.guilds.cache.has(id)).length}`
            })
            .setFooter({ 
                text: `أمر: ${OWNER_PREFIX}unlock <ID> لفتح السيرفر\nعرض ${start+1}-${Math.min(end, lockedServers.length)} من ${lockedServers.length}` 
            })
            .setTimestamp();
        
        await message.reply({ embeds: [locklistEmbed] });
        return;
    }
    
    // أمر server
    if (command === 'server') {
        const serverId = args[0];
        
        if (!serverId) {
            const errorEmbed = new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle('❌ خطأ')
                .setDescription(`**يجب إدخال ID السيرفر!**\n\nمثال: \`${OWNER_PREFIX}server 123456789012345678\``)
                .setFooter({ text: 'استخدم !servers لرؤية قائمة السيرفرات' });
            
            return message.reply({ embeds: [errorEmbed] });
        }
        
        const guild = client.guilds.cache.get(serverId);
        
        // التحقق إذا السيرفر مقفل حتى لو مش موجود
        const lockedServers = serverSettings.lockedServers || [];
        const isLocked = lockedServers.includes(serverId);
        
        if (!guild) {
            const serverEmbed = new EmbedBuilder()
                .setColor(isLocked ? 0xe74c3c : 0x95a5a6)
                .setTitle('🏠 سيرفر غير موجود في البوت')
                .setDescription(`**البوت غير موجود في هذا السيرفر حالياً**`)
                .addFields(
                    { name: '🆔 **معرف السيرفر**', value: `\`${serverId}\``, inline: false },
                    { name: '🔐 **حالة القفل**', value: isLocked ? '🔒 مقفل (يمكن فتحه بالرغم من أن البوت مش موجود)' : '🔓 غير مقفل', inline: false }
                )
                .setFooter({ text: isLocked ? 'استخدم !unlock <ID> لفتح السيرفر' : 'السيرفر ليس مقفلاً' })
                .setTimestamp();
            
            await message.reply({ embeds: [serverEmbed] });
            return;
        }
        
        const settings = getServerSettings(guild.id);
        const isComplete = isServerSetupComplete(guild.id);
        const owner = await guild.fetchOwner();
        
        const serverEmbed = new EmbedBuilder()
            .setColor(isLocked ? 0xe74c3c : (isComplete ? 0x2ecc71 : 0xf39c12))
            .setTitle(`🏠 ${guild.name}`)
            .setDescription(`**معلومات مفصلة عن السيرفر**`)
            .addFields(
                { name: '🆔 **معرف السيرفر**', value: `\`${guild.id}\``, inline: false },
                { name: '👑 **المالك**', value: owner ? `${owner.user.tag}\n<@${owner.id}> (\`${owner.id}\`)` : 'غير معروف', inline: false },
                { name: '👥 **الأعضاء**', value: `${guild.memberCount.toLocaleString()} عضو`, inline: true },
                { name: '📅 **تاريخ الإنشاء**', value: `<t:${Math.floor(guild.createdTimestamp/1000)}:D>`, inline: true },
                { name: '📅 **تاريخ دخول البوت**', value: `<t:${Math.floor(guild.joinedTimestamp/1000)}:D>`, inline: true },
                { name: '⚙️ **حالة الإعدادات**', value: isComplete ? '✅ مكتملة' : '❌ غير مكتملة', inline: true },
                { name: '🔐 **حالة القفل**', value: isLocked ? '🔒 مقفل' : '🔓 مفتوح', inline: true }
            )
            .setFooter({ text: `استخدم ${OWNER_PREFIX}servers لعرض كل السيرفرات` })
            .setTimestamp();
        
        await message.reply({ embeds: [serverEmbed] });
        return;
    }
    
    // أمر broadcast
    if (command === 'broadcast') {
        const messageContent = args.join(' ');
        
        if (!messageContent) {
            const errorEmbed = new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle('❌ خطأ')
                .setDescription(`**يجب كتابة الرسالة!**\n\nمثال: \`${OWNER_PREFIX}broadcast هناك تحديث جديد للبوت...\``);
            
            return message.reply({ embeds: [errorEmbed] });
        }
        
        // رسالة تأكيد
        const confirmEmbed = new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle('⚠️ تأكيد إرسال رسالة للجميع')
            .setDescription(`**هل أنت متأكد من إرسال هذه الرسالة لجميع مالكي السيرفرات؟**\n\n${messageContent}`)
            .addFields({
                name: 'الإحصاءات',
                value: `• عدد السيرفرات: ${client.guilds.cache.size}\n• العدد التقديري للأعضاء: ${client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0)}`
            })
            .setFooter({ text: 'اكتب "نعم" خلال 30 ثانية للمتابعة' });
        
        const confirmMessage = await message.reply({ embeds: [confirmEmbed] });
        
        const filter = m => m.author.id === BOT_OWNER_ID;
        try {
            const collected = await message.channel.awaitMessages({ 
                filter, 
                max: 1, 
                time: 30000, 
                errors: ['time'] 
            });
            
            if (collected.first().content === 'نعم') {
                await confirmMessage.edit({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x3498db)
                            .setTitle('📤 جاري الإرسال...')
                            .setDescription('جاري إرسال الرسالة لجميع مالكي السيرفرات...')
                            .setFooter({ text: 'قد يستغرق هذا بعض الوقت' })
                    ]
                });
                
                let successCount = 0;
                let failCount = 0;
                let totalServers = client.guilds.cache.size;
                let current = 0;
                
                // إرسال لكل سيرفر
                for (const guild of client.guilds.cache.values()) {
                    current++;
                    try {
                        const owner = await guild.fetchOwner();
                        if (owner && owner.user) {
                            const broadcastEmbed = new EmbedBuilder()
                                .setColor(0xFFFFFF)
                                .setTitle('📢 إشعار من مالك بوت Sienna')
                                .setDescription(messageContent)
                                .addFields({
                                    name: 'معلومات الإرسال',
                                    value: `• السيرفر: ${guild.name}\n• التاريخ: ${new Date().toLocaleDateString('ar-SA')}\n• الوقت: ${new Date().toLocaleTimeString('ar-SA')}`
                                })
                                .setFooter({ 
                                    text: `Sienna Support Bot`, 
                                    iconURL: 'https://cdn.discordapp.com/attachments/1449057765397106830/1459265170584109067/8ed9b44c0b845fd2d1b092949bc83411.jpg?ex=69898a58&is=698838d8&hm=e64f57cb8ba535d347da7ea478c1400ff5da0d71018f631fc176bc96d51b9889&' 
                                })
                                .setTimestamp();
                            
                            await owner.send({ embeds: [broadcastEmbed] });
                            successCount++;
                            console.log(`✅ تم إرسال رسالة لمالك ${guild.name} (${owner.user.tag})`);
                        } else {
                            failCount++;
                        }
                    } catch (error) {
                        failCount++;
                        console.log(`❌ فشل إرسال رسالة لمالك ${guild.name}:`, error.message);
                    }
                }
                
                // النتيجة النهائية
                await confirmMessage.edit({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x2ecc71)
                            .setTitle('✅ تم الإرسال بنجاح!')
                            .setDescription(`**تم إرسال الرسالة بنجاح**\n\n${messageContent}`)
                            .addFields(
                                { name: '📊 النتائج', value: `• السيرفرات: ${totalServers}\n• الناجح: ${successCount}\n• الفاشل: ${failCount}`, inline: true },
                                { name: '📈 النسبة', value: `• النجاح: ${Math.round((successCount / totalServers) * 100)}%\n• الفشل: ${Math.round((failCount / totalServers) * 100)}%`, inline: true }
                            )
                            .setFooter({ text: 'تم الإرسال بنجاح' })
                            .setTimestamp()
                    ]
                });
            } else {
                await confirmMessage.edit({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xf39c12)
                            .setTitle('❌ تم إلغاء العملية')
                            .setDescription('لم يتم إرسال الرسالة.')
                    ]
                });
            }
        } catch (error) {
            await confirmMessage.edit({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x95a5a6)
                        .setTitle('⏰ انتهى الوقت')
                        .setDescription('لم يتم الرد في الوقت المحدد.')
                ]
            });
        }
        return;
    }
    
    // أمر dm
    if (command === 'dm') {
        const serverId = args[0];
        const dmMessage = args.slice(1).join(' ');
        
        if (!serverId || !dmMessage) {
            const errorEmbed = new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle('❌ خطأ')
                .setDescription(`**يجب إدخال ID السيرفر والرسالة!**\n\nمثال: \`${OWNER_PREFIX}dm 123456789012345678 مرحباً، هناك تحديث جديد...\``);
            
            return message.reply({ embeds: [errorEmbed] });
        }
        
        const guild = client.guilds.cache.get(serverId);
        
        if (!guild) {
            const errorEmbed = new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle('❌ سيرفر غير موجود')
                .setDescription(`**لا يوجد سيرفر بالـ ID:** \`${serverId}\``);
            
            return message.reply({ embeds: [errorEmbed] });
        }
        
        try {
            const owner = await guild.fetchOwner();
            if (!owner || !owner.user) {
                throw new Error('لا يمكن الوصول لمالك السيرفر');
            }
            
            const dmEmbed = new EmbedBuilder()
                .setColor(0xFFFFFF)
                .setTitle('رساله من مطور بوت  Sienna :>')
                .setDescription(dmMessage)
                .addFields({
                    name: 'معلومات الإرسال',
                    value: `• السيرفر: ${guild.name}\n• التاريخ: ${new Date().toLocaleDateString('ar-SA')}\n• المرسل: ${message.author.tag}`
                })
                .setFooter({ 
                    text: `Sienna Support Bot`, 
                    iconURL: 'https://cdn.discordapp.com/attachments/1449057765397106830/1459265170584109067/8ed9b44c0b845fd2d1b092949bc83411.jpg?ex=69898a58&is=698838d8&hm=e64f57cb8ba535d347da7ea478c1400ff5da0d71018f631fc176bc96d51b9889&' 
                })
                .setTimestamp();
            
            await owner.send({ embeds: [dmEmbed] });
            
            const successEmbed = new EmbedBuilder()
                .setColor(0x2ecc71)
                .setTitle('✅ تم الإرسال بنجاح!')
                .setDescription(`**تم إرسال الرسالة لمالك ${guild.name}!**`)
                .addFields(
                    { name: '👑 **المالك**', value: owner.user.tag, inline: true },
                    { name: '🏠 **السيرفر**', value: guild.name, inline: true },
                    { name: '📨 **محتوى الرسالة**', value: dmMessage.substring(0, 100) + (dmMessage.length > 100 ? '...' : ''), inline: false }
                );
            
            await message.reply({ embeds: [successEmbed] });
            
        } catch (error) {
            const errorEmbed = new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle('❌ فشل إرسال الرسالة!')
                .setDescription(`**حدث خطأ:**\n\`${error.message}\``);
            
            await message.reply({ embeds: [errorEmbed] });
        }
        return;
    }
    
    // أمر clearownerdm - مسح الشات الخاص مع المالك
    if (command === 'clearownerdm') {
        const confirmEmbed = new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle('⚠️ تأكيد مسح الشات الخاص')
            .setDescription('**هل أنت متأكد من مسح كل رسائل الشات الخاص مع المالك؟**\n\n**سيتم:**\n• حذف كل رسائل البوت في الخاص معك\n• هذه العملية لا يمكن التراجع عنها\n• قد تستغرق بعض الوقت')
            .setFooter({ text: 'اكتب "تأكيد" خلال 30 ثانية للمتابعة' });
        
        const confirmMessage = await message.reply({ embeds: [confirmEmbed] });
        
        const filter = m => m.author.id === BOT_OWNER_ID;
        try {
            const collected = await message.channel.awaitMessages({ 
                filter, 
                max: 1, 
                time: 30000, 
                errors: ['time'] 
            });
            
            if (collected.first().content === 'تأكيد') {
                await confirmMessage.edit({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x3498db)
                            .setTitle('🔄 جاري المسح...')
                            .setDescription('جاري مسح رسائل الشات الخاص...')
                            .setFooter({ text: 'قد يستغرق هذا بعض الوقت' })
                    ]
                });
                
                try {
                    // الحصول على DM channel مع المالك
                    const ownerDM = await message.author.createDM();
                    
                    // جلب كل الرسائل (بحد 100 رسالة لكل مرة)
                    let deletedCount = 0;
                    let hasMore = true;
                    
                    while (hasMore) {
                        const messages = await ownerDM.messages.fetch({ limit: 100 });
                        
                        if (messages.size === 0) {
                            hasMore = false;
                            break;
                        }
                        
                        // تصفية رسائل البوت فقط
                        const botMessages = messages.filter(m => m.author.id === client.user.id);
                        
                        // حذف الرسائل
                        for (const msg of botMessages.values()) {
                            try {
                                await msg.delete();
                                deletedCount++;
                            } catch (error) {
                                console.log(`❌ لم أستطع حذف رسالة: ${error.message}`);
                            }
                        }
                        
                        // إذا كان عدد الرسائل أقل من 100، معناه خلصنا
                        if (messages.size < 100) {
                            hasMore = false;
                        }
                    }
                    
                    await confirmMessage.edit({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0x2ecc71)
                                .setTitle('✅ تم المسح بنجاح!')
                                .setDescription(`**تم مسح الشات الخاص مع المالك بنجاح**`)
                                .addFields({
                                    name: '📊 النتائج',
                                    value: `• **عدد الرسائل المحذوفة:** ${deletedCount}\n• **المسح:** رسائل البوت فقط\n• **الحالة:** تم التنظيف بنجاح`
                                })
                                .setFooter({ text: 'يمكنك الآن البدء بشات نظيف' })
                                .setTimestamp()
                        ]
                    });
                    
                    console.log(`✅ تم مسح ${deletedCount} رسالة من الشات الخاص مع المالك`);
                    
                } catch (error) {
                    await confirmMessage.edit({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xe74c3c)
                                .setTitle('❌ فشل المسح!')
                                .setDescription(`**حدث خطأ أثناء محاولة مسح الرسائل:**\n\`${error.message}\``)
                        ]
                    });
                }
            } else {
                await confirmMessage.edit({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xf39c12)
                            .setTitle('❌ تم إلغاء العملية')
                            .setDescription('لم يتم مسح رسائل الشات الخاص.')
                    ]
                });
            }
        } catch (error) {
            await confirmMessage.edit({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x95a5a6)
                        .setTitle('⏰ انتهى الوقت')
                        .setDescription('لم يتم الرد في الوقت المحدد.')
                ]
            });
        }
        return;
    }
    
    // أمر leave
    if (command === 'leave') {
        const serverId = args[0];
        
        if (!serverId) {
            const errorEmbed = new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle('❌ خطأ')
                .setDescription(`**يجب إدخال ID السيرفر!**\n\nمثال: \`${OWNER_PREFIX}leave 123456789012345678\``);
            
            return message.reply({ embeds: [errorEmbed] });
        }
        
        const guild = client.guilds.cache.get(serverId);
        
        if (!guild) {
            const errorEmbed = new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle('❌ سيرفر غير موجود')
                .setDescription(`**لا يوجد سيرفر بالـ ID:** \`${serverId}\``);
            
            return message.reply({ embeds: [errorEmbed] });
        }
        
        const confirmEmbed = new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle('⚠️ تأكيد خروج البوت')
            .setDescription(`**هل أنت متأكد من إخراج البوت من ${guild.name}؟**\n\n**سيتم:**\n• حذف كل إعدادات السيرفر\n• إزالة البوت من السيرفر\n• لا يمكن التراجع عن هذه العملية`)
            .setFooter({ text: 'اكتب "تأكيد" خلال 30 ثانية للمتابعة' });
        
        const confirmMessage = await message.reply({ embeds: [confirmEmbed] });
        
        const filter = m => m.author.id === BOT_OWNER_ID;
        try {
            const collected = await message.channel.awaitMessages({ 
                filter, 
                max: 1, 
                time: 30000, 
                errors: ['time'] 
            });
            
            if (collected.first().content === 'تأكيد') {
                // مسح إعدادات السيرفر
                delete serverSettings[guild.id];
                
                // إزالة من القائمة المقفلة إذا موجود
                if (serverSettings.lockedServers) {
                    serverSettings.lockedServers = serverSettings.lockedServers.filter(id => id !== guild.id);
                }
                
                saveSettings(serverSettings);
                
                // خروج البوت من السيرفر
                await guild.leave();
                
                await confirmMessage.edit({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x2ecc71)
                            .setTitle('✅ تم خروج البوت بنجاح!')
                            .setDescription(`تم إخراج البوت من **${guild.name}** بنجاح.\n\n**تم حذف:**\n• كل إعدادات السيرفر\n• بيانات النظام`)
                            .setFooter({ text: 'تم الخروج بنجاح' })
                    ]
                });
                
                console.log(`✅ البوت خرج من سيرفر: ${guild.name} (${guild.id})`);
            } else {
                await confirmMessage.edit({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xf39c12)
                            .setTitle('❌ تم إلغاء العملية')
                            .setDescription('لم يتم إخراج البوت.')
                    ]
                });
            }
        } catch (error) {
            await confirmMessage.edit({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x95a5a6)
                        .setTitle('⏰ انتهى الوقت')
                        .setDescription('لم يتم الرد في الوقت المحدد.')
                ]
            });
        }
        return;
    }
    
    // أمر clearsettings
    if (command === 'clearsettings') {
        const serverId = args[0];
        
        if (!serverId) {
            const errorEmbed = new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle('❌ خطأ')
                .setDescription(`**يجب إدخال ID السيرفر!**\n\nمثال: \`${OWNER_PREFIX}clearsettings 123456789012345678\``);
            
            return message.reply({ embeds: [errorEmbed] });
        }
        
        const guild = client.guilds.cache.get(serverId);
        
        if (!guild) {
            const errorEmbed = new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle('❌ سيرفر غير موجود')
                .setDescription(`**لا يوجد سيرفر بالـ ID:** \`${serverId}\``);
            
            return message.reply({ embeds: [errorEmbed] });
        }
        
        const confirmEmbed = new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle('⚠️ تأكيد مسح الإعدادات')
            .setDescription(`**هل أنت متأكد من مسح إعدادات ${guild.name}؟**\n\n**سيتم:**\n• حذف كل الإعدادات المخصصة\n• البوت سيتوقف عن العمل في هذا السيرفر حتى يتم إعادة الإعداد\n• يمكن إعادة الإعداد لاحقاً`)
            .setFooter({ text: 'اكتب "تأكيد" خلال 30 ثانية للمتابعة' });
        
        const confirmMessage = await message.reply({ embeds: [confirmEmbed] });
        
        const filter = m => m.author.id === BOT_OWNER_ID;
        try {
            const collected = await message.channel.awaitMessages({ 
                filter, 
                max: 1, 
                time: 30000, 
                errors: ['time'] 
            });
            
            if (collected.first().content === 'تأكيد') {
                delete serverSettings[guild.id];
                saveSettings(serverSettings);
                
                await confirmMessage.edit({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x2ecc71)
                            .setTitle('✅ تم مسح الإعدادات بنجاح!')
                            .setDescription(`تم مسح إعدادات **${guild.name}** بنجاح.\n\n**لمساعدة المالك:**\nيمكنه استخدام \`/help\` لعرض أوامر الإعداد من جديد.`)
                            .setFooter({ text: 'استخدم /help للإعداد من جديد' })
                    ]
                });
                
                console.log(`✅ تم مسح إعدادات سيرفر: ${guild.name} (${guild.id})`);
            } else {
                await confirmMessage.edit({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xf39c12)
                            .setTitle('❌ تم إلغاء العملية')
                            .setDescription('لم يتم مسح الإعدادات.')
                    ]
                });
            }
        } catch (error) {
            await confirmMessage.edit({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x95a5a6)
                        .setTitle('⏰ انتهى الوقت')
                        .setDescription('لم يتم الرد في الوقت المحدد.')
                ]
            });
        }
        return;
    }
    
    // أمر lock للسيرفر المحدد
    if (command === 'lock') {
        const serverId = args[0];
        
        if (!serverId) {
            const lockEmbed = new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle('🔒 قفل البوت في سيرفر محدد')
                .setDescription('**استخدام:**\n`!lock <ID_السيرفر>`\n\n**مثال:**\n`!lock 123456789012345678`\n\nلرؤية قائمة السيرفرات: `!servers`')
                .setFooter({ text: 'هذا الأمر بيقفل البوت في سيرفر محدد فقط' });
            
            return message.reply({ embeds: [lockEmbed] });
        }
        
        const guild = client.guilds.cache.get(serverId);
        
        // إضافة السيرفر للقائمة المغلقة حتى لو مش موجود
        if (!serverSettings.lockedServers) serverSettings.lockedServers = [];
        
        if (!serverSettings.lockedServers.includes(serverId)) {
            serverSettings.lockedServers.push(serverId);
            saveSettings(serverSettings);
        }
        
        const lockEmbed = new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle('✅ تم قفل البوت في السيرفر')
            .setDescription(`**تم قفل البوت بنجاح في السيرفر:**`)
            .addFields(
                { 
                    name: '🔐 **حالة القفل**', 
                    value: `تم إضافة السيرفر للقائمة المقفلة بنجاح.\n\n**معرف السيرفر:** \`${serverId}\``,
                    inline: false 
                }
            );
        
        if (guild) {
            lockEmbed.addFields(
                { name: '🏠 **السيرفر**', value: guild.name, inline: true },
                { name: '👑 **المالك**', value: `<@${guild.ownerId}>`, inline: true },
                { name: '👥 **الأعضاء**', value: guild.memberCount.toLocaleString(), inline: true }
            );
            lockEmbed.setDescription(`**تم قفل البوت بنجاح في:**\n\n🏠 **السيرفر:** ${guild.name}`);
        } else {
            lockEmbed.addFields(
                { name: '📌 **ملاحظة**', value: 'البوت غير موجود في هذا السيرفر حالياً، لكن تم إضافته للقائمة المقفلة.', inline: false }
            );
        }
        
        lockEmbed.addFields({
            name: '💡 **معلومة**',
            value: 'لإعادة تفعيل البوت في هذا السيرفر، استخدم:\n`!unlock ' + serverId + '`\n\nلعرض قائمة السيرفرات المقفلة: `!locklist`'
        })
        .setFooter({ text: `تم القفل بواسطة: ${message.author.tag}` })
        .setTimestamp();
        
        await message.reply({ embeds: [lockEmbed] });
        return;
    }
    
    // أمر unlock للسيرفر المحدد (حتى لو البوت مش موجود)
    if (command === 'unlock') {
        const serverId = args[0];
        
        if (!serverId) {
            const unlockEmbed = new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle('🔓 فتح البوت في سيرفر محدد')
                .setDescription('**استخدام:**\n`!unlock <ID_السيرفر>`\n\n**مثال:**\n`!unlock 123456789012345678`\n\nلرؤية قائمة السيرفرات: `!servers`')
                .setFooter({ text: 'هذا الأمر بيفتح البوت في سيرفر محدد (حتى لو البوت مش موجود)' });
            
            return message.reply({ embeds: [unlockEmbed] });
        }
        
        const guild = client.guilds.cache.get(serverId);
        
        // إزالة السيرفر من القائمة المغلقة (حتى لو مش موجود)
        if (!serverSettings.lockedServers) serverSettings.lockedServers = [];
        
        const wasLocked = serverSettings.lockedServers.includes(serverId);
        
        if (wasLocked) {
            serverSettings.lockedServers = serverSettings.lockedServers.filter(id => id !== serverId);
            saveSettings(serverSettings);
        }
        
        const unlockEmbed = new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle('✅ تم فتح البوت في السيرفر')
            .setDescription(`**تم فتح البوت بنجاح في السيرفر:**`);
        
        if (guild) {
            unlockEmbed.addFields(
                { name: '🏠 **السيرفر**', value: guild.name, inline: true },
                { name: '👑 **المالك**', value: `<@${guild.ownerId}>`, inline: true },
                { name: '👥 **الأعضاء**', value: guild.memberCount.toLocaleString(), inline: true },
                { name: '🔓 **الحالة**', value: wasLocked ? '✅ تم الفتح' : '⚠️ لم يكن مقفلاً', inline: false }
            );
            unlockEmbed.setDescription(`**تم فتح البوت بنجاح في:**\n\n🏠 **السيرفر:** ${guild.name}`);
        } else {
            unlockEmbed.addFields(
                { name: '🔑 **المعرف**', value: `\`${serverId}\``, inline: false },
                { name: '🔓 **الحالة**', value: wasLocked ? '✅ تم الفتح (البوت غير موجود)' : '⚠️ لم يكن مقفلاً', inline: false },
                { name: '📌 **ملاحظة**', value: 'البوت غير موجود في هذا السيرفر حالياً، لكن تم إزالته من القائمة المقفلة.', inline: false }
            );
        }
        
        unlockEmbed.setFooter({ text: `تم الفتح بواسطة: ${message.author.tag}` })
        .setTimestamp();
        
        await message.reply({ embeds: [unlockEmbed] });
        return;
    }
    
    // أمر help للمالك
    if (command === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle('🆘 مركز مساعدة المالك')
            .setDescription(`**أوامر لوحة التحكم - البادئة: \`${OWNER_PREFIX}\`**\n\n**فقط أنت (${message.author.tag}) يمكنك استخدام هذه الأوامر**`)
            .addFields(
                {
                    name: '📊 **أوامر الإحصائيات**',
                    value: `\`${OWNER_PREFIX}stats\` - إحصائيات البوت الكاملة\n\`${OWNER_PREFIX}servers [صفحة]\` - قائمة السيرفرات مع كل التفاصيل\n\`${OWNER_PREFIX}server <ID>\` - معلومات سيرفر محدد\n\`${OWNER_PREFIX}locklist [صفحة]\` - قائمة السيرفرات المقفلة فقط`
                },
                {
                    name: '📢 **أوامر البث والمراسلة**',
                    value: `\`${OWNER_PREFIX}broadcast <رسالة>\` - إرسال رسالة لجميع المالكين\n\`${OWNER_PREFIX}dm <ID_السيرفر> <رسالة>\` - إرسال رسالة لمالك سيرفر محدد\n\`${OWNER_PREFIX}clearownerdm\` - مسح الشات الخاص مع المالك`
                },
                {
                    name: '⚙️ **أوامر التحكم**',
                    value: `\`${OWNER_PREFIX}lock <ID_السيرفر>\` - قفل البوت في سيرفر محدد (حتى لو البوت مش موجود)\n\`${OWNER_PREFIX}unlock <ID_السيرفر>\` - فتح البوت في سيرفر محدد (حتى لو البوت مش موجود)\n\`${OWNER_PREFIX}leave <ID_السيرفر>\` - إخراج البوت من سيرفر\n\`${OWNER_PREFIX}clearsettings <ID_السيرفر>\` - مسح إعدادات سيرفر`
                },
                {
                    name: '👑 **أوامر عامة**',
                    value: `\`${OWNER_PREFIX}panel\` - عرض لوحة التحكم\n\`${OWNER_PREFIX}help\` - عرض هذه القائمة`
                }
            )
            .addFields({
                name: '💡 **ملاحظات هامة**',
                value: '• يمكنك قفل سيرفرات حتى لو البوت مش موجود فيها\n• يمكنك فتح سيرفرات مقفلة حتى لو البوت مش موجود فيها\n• قائمة `!locklist` تظهر كل السيرفرات المقفلة\n• `!clearownerdm` يمسح كل رسائل البوت في الخاص معك'
            })
            .setFooter({ text: `ID المالك: ${BOT_OWNER_ID} | ${client.guilds.cache.size} سيرفر` })
            .setTimestamp();
        
        await message.reply({ embeds: [helpEmbed] });
        return;
    }
});

// ================ نظام Slash Commands ================

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;
    
    const { commandName, options, guild, member, user } = interaction;
    
    // التحقق إذا السيرفر مقفل
    const lockedServers = serverSettings.lockedServers || [];
    if (lockedServers.includes(guild.id)) {
        return interaction.reply({ 
            content: '❌ **يجب تجديد الاشتراك :<**\n\nموقع تجديد الاشتراك: [ https://siennaai.pages.dev/ ]',
            ephemeral: true 
        });
    }
    
    // الحصول على إعدادات السيرفر
    let settings = getServerSettings(guild.id);
    if (!settings) {
        settings = {
            audioSetId: 'set1'
        };
        serverSettings[guild.id] = settings;
    }
    
    // التحقق من الصلاحيات
    if (!canUseSetupCommands(member, guild, settings)) {
        return interaction.reply({ 
            content: '❌ **ليس لديك الصلاحية لاستخدام هذه الأوامر!**\n\nفقط مالك السيرفر والمشرفون يمكنهم استخدام أوامر الإعداد.',
            ephemeral: true 
        });
    }
    
    // أمر المساعدة
    if (commandName === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle('🆘 مركز المساعدة - بوت الدعم الصوتي')
            .setDescription('**قائمة الأوامر المتاحة للإدارة**\n\n**📍 استخدم `/` ثم اكتب اسم الأمر**')
            .addFields(
                { 
                    name: '📝 **الخطوة الأولى: الإعداد الإجباري**', 
                    value: `
**يجب تنفيذ هذه الخطوات بالترتيب:**

1️⃣ **\`/setup category\`**
• تحديد تصنيف للغرف الخاصة
• **الهدف:** هنا بيتنشأ الرومات الخاصة

2️⃣ **\`/setup voice\`**
• تحديد روم الانتظار الصوتي
• **الهدف:** هنا العملاء بيدخلوا يستنوا الدعم

3️⃣ **\`/setup text\`**
• تحديد روم إرسال الإشعارات
• **الهدف:** هنا بيرسل البوت إشعارات بوجود عملاء

4️⃣ **\`/setup role\`**
• تحديد رتبة الإدارة
• **الهدف:** مين اللي هيقدر يدخل يستقبل العملاء؟
                    `
                },
                { 
                    name: '🎵 **الخطوة الثانية: إعدادات الصوت (اختياري)**', 
                    value: `
**\`/setup waiting\`**
• اختيار مجموعة الصوت
• **set1:** صوت انتظار عادي + موسيقى خلفية
• **set2:** صوت انتظار مختلف + موسيقى مختلفة
• **set3:** موسيقى فقط بدون صوت انتظار
                    `
                },
                { 
                    name: '👁️ **أوامر العرض والتحكم**', 
                    value: `
**\`/setup show\`**
• عرض الإعدادات الحالية
• **الهدف:** شوف كل الإعدادات بشكل منظم

**\`/reset\`**
• مسح كل الإعدادات
• **تحذير:** بيرجع كل حاجة للنقطة صفر!
• **الاستخدام:** للتصحيح أو إعادة الإعداد

**\`/help\`**
• عرض هذه القائمة
                    `
                }
            )
            .addFields(
                {
                    name: '⚠️ **ملاحظات هامة**',
                    value: `
1. **يجب إكمال الخطوات الأربعة الإجبارية** قبل ما يشتغل البوت
2. **الرتبة المحددة** هي اللي بتحدد مين المشرفين
3. **Owner السيرفر** و **Admins** يقدرون يستخدموا الأوامر
                    `
                },
                {
                    name: '📚 **كيف تجيب الـ ID؟**',
                    value: `
1. فتح **Settings → Advanced → Developer Mode**
2. كليك يمين على أي قناة أو رتبة → **Copy ID**
                    `
                }
            )
            .setFooter({ 
                text: `السيرفر: ${guild.name} | حالة الإعدادات: ${isServerSetupComplete(guild.id) ? '✅ مكتملة' : '❌ غير مكتملة'}` 
            })
            .setTimestamp();
        
        return interaction.reply({ embeds: [helpEmbed], ephemeral: true });
    }
    
    // أمر عرض الإعدادات
    if (commandName === 'setup' && options.getSubcommand() === 'show') {
        const settingsText = formatSettings(guild, settings);
        
        const embed = new EmbedBuilder()
            .setColor(isServerSetupComplete(guild.id) ? 0x2ecc71 : 0xe74c3c)
            .setTitle('⚙️ الإعدادات الحالية')
            .setDescription(settingsText)
            .setFooter({ 
                text: isServerSetupComplete(guild.id) 
                    ? '✅ النظام جاهز للعمل' 
                    : '❌ النظام غير مكتمل - استخدم أوامر الإعداد' 
            })
            .setTimestamp();
        
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    // أمر إعداد الصوت
    if (commandName === 'setup' && options.getSubcommand() === 'waiting') {
        const audioSetId = options.getString('set');
        const audioSet = audioSets.find(set => set.id === audioSetId);
        
        settings.audioSetId = audioSetId;
        serverSettings[guild.id] = settings;
        saveSettings(serverSettings);
        
        return interaction.reply({ 
            content: `✅ **تم تحديث مجموعة الصوت بنجاح!**\n🎵 **المجموعة الجديدة:** ${audioSet.name}`,
            ephemeral: true 
        });
    }
    
    // أمر إعداد التصنيف
    if (commandName === 'setup' && options.getSubcommand() === 'category') {
        const categoryId = options.getString('id');
        
        const category = await guild.channels.fetch(categoryId).catch(() => null);
        
        if (!category || category.type !== ChannelType.GuildCategory) {
            return interaction.reply({ 
                content: '❌ **التصنيف غير موجود أو ليس تصنيفاً صالحاً!**',
                ephemeral: true 
            });
        }
        
        settings.categoryId = categoryId;
        serverSettings[guild.id] = settings;
        saveSettings(serverSettings);
        
        if (isServerSetupComplete(guild.id)) {
            return interaction.reply({ 
                content: `✅ **تم تحديث التصنيف بنجاح!**\n📂 **التصنيف:** ${category.name}\n\n🎉 **تهانينا!** النظام أصبح جاهزاً للعمل!`,
                ephemeral: true 
            });
        } else {
            return interaction.reply({ 
                content: `✅ **تم تحديث التصنيف بنجاح!**\n📂 **التصنيف:** ${category.name}\n\n⚠️ **مطلوب:** لا تزال تحتاج إلى إعداد روم الصوت وروم النص ورتبة الإدارة.`,
                ephemeral: true 
            });
        }
    }
    
    // أمر إعداد روم الصوت
    if (commandName === 'setup' && options.getSubcommand() === 'voice') {
        const voiceId = options.getString('id');
        
        const voiceChannel = await guild.channels.fetch(voiceId).catch(() => null);
        
        if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
            return interaction.reply({ 
                content: '❌ **القناة غير موجودة أو ليست روم صوت!**',
                ephemeral: true 
            });
        }
        
        settings.voiceId = voiceId;
        serverSettings[guild.id] = settings;
        saveSettings(serverSettings);
        
        if (isServerSetupComplete(guild.id)) {
            return interaction.reply({ 
                content: `✅ **تم تحديث روم الانتظار بنجاح!**\n🎧 **الروم:** ${voiceChannel.name}\n\n🎉 **تهانينا!** النظام أصبح جاهزاً للعمل!`,
                ephemeral: true 
            });
        } else {
            return interaction.reply({ 
                content: `✅ **تم تحديث روم الانتظار بنجاح!**\n🎧 **الروم:** ${voiceChannel.name}\n\n⚠️ **مطلوب:** لا تزال تحتاج إلى إعداد التصنيف وروم النص ورتبة الإدارة.`,
                ephemeral: true 
            });
        }
    }
    
    // أمر إعداد روم النص
    if (commandName === 'setup' && options.getSubcommand() === 'text') {
        const textId = options.getString('id');
        
        const textChannel = await guild.channels.fetch(textId).catch(() => null);
        
        if (!textChannel || textChannel.type !== ChannelType.GuildText) {
            return interaction.reply({ 
                content: '❌ **القناة غير موجودة أو ليست روم نص!**',
                ephemeral: true 
            });
        }
        
        settings.textId = textId;
        serverSettings[guild.id] = settings;
        saveSettings(serverSettings);
        
        if (isServerSetupComplete(guild.id)) {
            return interaction.reply({ 
                content: `✅ **تم تحديث روم الإشعارات بنجاح!**\n💬 **الروم:** ${textChannel.name}\n\n🎉 **تهانينا!** النظام أصبح جاهزاً للعمل!`,
                ephemeral: true 
            });
        } else {
            return interaction.reply({ 
                content: `✅ **تم تحديث روم الإشعارات بنجاح!**\n💬 **الروم:** ${textChannel.name}\n\n⚠️ **مطلوب:** لا تزال تحتاج إلى إعداد التصنيف وروم الصوت ورتبة الإدارة.`,
                ephemeral: true 
            });
        }
    }
    
    // أمر إعداد رتبة الإدارة
    if (commandName === 'setup' && options.getSubcommand() === 'role') {
        const roleId = options.getString('id');
        
        const role = await guild.roles.fetch(roleId).catch(() => null);
        
        if (!role) {
            return interaction.reply({ 
                content: '❌ **الرتبة غير موجودة!**',
                ephemeral: true 
            });
        }
        
        settings.adminRoleId = roleId;
        serverSettings[guild.id] = settings;
        saveSettings(serverSettings);
        
        if (isServerSetupComplete(guild.id)) {
            return interaction.reply({ 
                content: `✅ **تم تحديث رتبة الإدارة بنجاح!**\n👑 **الرتبة:** ${role.name}\n\n🎉 **تهانينا!** النظام أصبح جاهزاً للعمل!`,
                ephemeral: true 
            });
        } else {
            return interaction.reply({ 
                content: `✅ **تم تحديث رتبة الإدارة بنجاح!**\n👑 **الرتبة:** ${role.name}\n\n⚠️ **مطلوب:** لا تزال تحتاج إلى إعداد التصنيف وروم الصوت وروم النص.`,
                ephemeral: true 
            });
        }
    }
    
    // أمر المسح
    if (commandName === 'reset') {
        const confirmEmbed = new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle('⚠️ تأكيد مسح الإعدادات')
            .setDescription('هل أنت متأكد من مسح **كل إعدادات** هذا السيرفر؟\n\n**سيتم:**\n• حذف كل الإعدادات المخصصة\n• البوت سيتوقف عن العمل حتى تقوم بالإعداد من جديد')
            .setFooter({ text: 'اكتب "تأكيد" كرد على هذه الرسالة خلال 30 ثانية' });
        
        await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });
        const reply = await interaction.fetchReply();
        
        const filter = m => m.author.id === user.id && m.channel.id === interaction.channelId;
        try {
            const collected = await interaction.channel.awaitMessages({ 
                filter, 
                max: 1, 
                time: 30000, 
                errors: ['time'] 
            });
            
            if (collected.first().content === 'تأكيد') {
                delete serverSettings[guild.id];
                saveSettings(serverSettings);
                
                const successEmbed = new EmbedBuilder()
                    .setColor(0x2ecc71)
                    .setTitle('✅ تم مسح الإعدادات بنجاح')
                    .setDescription('تم حذف كل الإعدادات المخصصة لهذا السيرفر.\n\n**يجب الآن إعادة الإعداد باستخدام:**')
                    .addFields(
                        { name: '1. إعداد التصنيف', value: '`/setup category`', inline: false },
                        { name: '2. إعداد روم الصوت', value: '`/setup voice`', inline: false },
                        { name: '3. إعداد روم النص', value: '`/setup text`', inline: false },
                        { name: '4. إعداد رتبة الإدارة', value: '`/setup role`', inline: false }
                    )
                    .setFooter({ text: 'استخدم /help لعرض كل الأوامر' });
                
                await interaction.editReply({ embeds: [successEmbed] });
            } else {
                await interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xf39c12)
                            .setTitle('❌ تم إلغاء العملية')
                            .setDescription('لم يتم مسح الإعدادات.')
                    ]
                });
            }
        } catch (error) {
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x95a5a6)
                        .setTitle('⏰ انتهى الوقت')
                        .setDescription('لم يتم الرد في الوقت المحدد.')
                ]
            });
        }
        return;
    }
});

// ================ نظام الصوت الأساسي ================

client.on('voiceStateUpdate', async (oldState, newState) => {
    try {
        const member = newState.member;
        if (!member || member.user.bot) return;
        
        const guildId = newState.guild.id;
        const settings = getServerSettings(guildId);
        
        // إذا النظام غير مكتمل، تجاهل
        if (!isServerSetupComplete(guildId)) {
            return;
        }
        
        const supportVoiceId = settings.voiceId;
        const supportTextId = settings.textId;
        const supportCategoryId = settings.categoryId;
        const adminRoleId = settings.adminRoleId;
        
        const voiceChannel = newState.channel;
        
        // دخول روم الانتظار
        if (newState.channelId === supportVoiceId && newState.channelId !== oldState.channelId) {
            // لو دخل شخص معاه الرتبة المحددة
            if (member.roles.cache.has(adminRoleId)) {
                console.log(`👑 ${member.user.tag} (إدارة) دخل روم الانتظار`);
                
                const clientsInRoom = voiceChannel.members.filter(m => 
                    !m.user.bot && !m.roles.cache.has(adminRoleId)
                );
                
                // لكل عميل في روم الانتظار
                for (const clientMember of clientsInRoom.values()) {
                    const clientId = clientMember.id;
                    const callData = activeCalls.get(clientId);
                    
                    if (callData && !callData.hasAdmin && !callData.privateRoomId) {
                        console.log(`🔄 بدء عملية إنشاء روم خاص للعميل ${clientMember.user.tag}`);
                        
                        // 1. أوقف الموسيقى للعميل
                        callData.isBotMuted = true;
                        if (callData.musicPlayer) {
                            callData.musicPlayer.stop();
                        }
                        
                        // 2. إرسال إشعار استلام الطلب
                        await sendAdminAcceptNotification(
                            voiceChannel.guild,
                            settings,
                            clientId,
                            member.id,
                            member.user.tag,
                            clientMember.user.tag
                        );
                        
                        // 3. إنشاء روم صوتي خاص
                        const privateRoom = await createPrivateVoiceRoom(
                            voiceChannel.guild,
                            settings,
                            clientId,
                            clientMember.user.username,
                            member.id,
                            member.user.tag
                        );
                        
                        if (privateRoom) {
                            // 4. حفظ بيانات الروم الخاص
                            callData.privateRoomId = privateRoom.id;
                            callData.privateRoomName = privateRoom.name;
                            callData.lastAdminId = member.id;
                            callData.hasAdmin = true;
                            callData.callStartTime = Date.now();
                            callData.adminName = member.user.tag;
                            
                            privateRooms.set(privateRoom.id, {
                                clientId: clientId,
                                clientName: clientMember.user.tag,
                                adminId: member.id,
                                adminName: member.user.tag,
                                createdAt: Date.now()
                            });
                            
                            // 5. نقل العميل والمشرف للروم الخاص
                            const moved = await moveToPrivateRoom(
                                voiceChannel.guild,
                                clientId,
                                member.id,
                                privateRoom.id
                            );
                            
                            if (moved) {
                                console.log(`✅ تم نقل ${clientMember.user.tag} و ${member.user.tag} للروم الخاص`);
                                
                                // 6. البوت يطلع من روم الانتظار
                                setTimeout(async () => {
                                    const conn = voiceConnections.get(guildId);
                                    if (conn) {
                                        conn.destroy();
                                        voiceConnections.delete(guildId);
                                        console.log(`🔌 البوت طلع من روم الانتظار`);
                                    }
                                }, 2000);
                            }
                        }
                        
                        break; // نتعامل مع عميل واحد فقط
                    }
                }
                
                return;
            }
            
            // دخول عميل عادي لروم الانتظار
            console.log(`👤 ${member.user.tag} دخل روم الانتظار`);
            
            if (!voiceChannel) return;
            
            // التحقق إذا فيه مشرف موجود
            const existingAdmin = getAdminInVoice(voiceChannel, settings);
            
            // إذا فيه مشرف موجود، نبدأ عملية إنشاء روم خاص فوراً
            if (existingAdmin) {
                console.log(`⚡ العميل ${member.user.tag} دخل ومشرف موجود بالفعل`);
                
                // إرسال إشعار استلام الطلب فوراً
                await sendAdminAcceptNotification(
                    voiceChannel.guild,
                    settings,
                    member.id,
                    existingAdmin.id,
                    existingAdmin.user.tag,
                    member.user.tag
                );
                
                // إنشاء روم صوتي خاص فوراً
                const privateRoom = await createPrivateVoiceRoom(
                    voiceChannel.guild,
                    settings,
                    member.id,
                    member.user.username,
                    existingAdmin.id,
                    existingAdmin.user.tag
                );
                
                if (privateRoom) {
                    // حفظ بيانات العميل
                    const callData = {
                        userId: member.id,
                        voiceChannelId: voiceChannel.id,
                        guildId: voiceChannel.guild.id,
                        isBotMuted: true,
                        hasAdmin: true,
                        lastAdminId: existingAdmin.id,
                        adminName: existingAdmin.user.tag,
                        userName: member.user.tag,
                        joinedAt: Date.now(),
                        privateRoomId: privateRoom.id,
                        privateRoomName: privateRoom.name,
                        callStartTime: Date.now()
                    };
                    
                    activeCalls.set(member.id, callData);
                    privateRooms.set(privateRoom.id, {
                        clientId: member.id,
                        clientName: member.user.tag,
                        adminId: existingAdmin.id,
                        adminName: existingAdmin.user.tag,
                        createdAt: Date.now()
                    });
                    
                    // نقل العميل والمشرف للروم الخاص
                    await moveToPrivateRoom(
                        voiceChannel.guild,
                        member.id,
                        existingAdmin.id,
                        privateRoom.id
                    );
                    
                    console.log(`✅ تم إنشاء روم خاص فوراً للعميل ${member.user.tag}`);
                }
                
                return;
            }
            
            // إذا مفيش مشرف، نبدأ عملية الانتظار
            
            // 1. البوت يدخل مع العميل فوراً
            const connection = await getOrCreateConnection(voiceChannel);
            if (!connection) {
                console.error('❌ فشل الاتصال الصوتي');
                return;
            }
            
            // زيادة المهلة لتفادي اخطاء الشبكة الصغيرة
            await entersState(connection, VoiceConnectionStatus.Ready, 10000);
            
            // 2. إرسال إشعار طلب جديد
            await sendNewCallNotification(voiceChannel.guild, settings, member.id, member.user.tag);

            // 3. اختيار مجموعة صوت بالتناوب لكل سيرفر
            const selectedAudioSet = getNextAudioSet(voiceChannel.guild.id);
            console.log(`🎵 تم اختيار ${selectedAudioSet.name} للعميل ${member.user.tag}`);

            // 4. الانتظار 4 ثواني فقط ثم تشغيل التسجيلات
            setTimeout(async () => {
                if (!member.voice.channelId || member.voice.channelId !== supportVoiceId) {
                    console.log(`❌ العميل ${member.user.tag} خرج قبل بدء الصوت`);
                    return;
                }

                // تشغيل صوت الانتظار من المجموعة المختارة
                if (selectedAudioSet.waiting) {
                    console.log(`🔊 تشغيل ${selectedAudioSet.waiting} للعميل ${member.id}`);
                    const waitingPlayer = playAudio(connection, selectedAudioSet.waiting, member.id, false, selectedAudioSet);

                    // حفظ بيانات العميل مع المجموعة الصوتية
                    const callData = {
                        connection,
                        waitingPlayer,
                        userId: member.id,
                        voiceChannelId: voiceChannel.id,
                        guildId: voiceChannel.guild.id,
                        isBotMuted: false,
                        hasAdmin: false,
                        userName: member.user.tag,
                        joinedAt: Date.now(),
                        audioSet: selectedAudioSet
                    };

                    // استمع لانتهاء صوت الانتظار ثم ابدأ الموسيقى الخلفية من نفس المجموعة
                    if (waitingPlayer) {
                        waitingPlayer.once(AudioPlayerStatus.Idle, () => {
                            if (member.voice.channelId === supportVoiceId) {
                                const currentAdmin = getAdminInVoice(voiceChannel, settings);
                                if (!currentAdmin) {
                                    console.log(`🎵 بدء موسيقى ${selectedAudioSet.background} للعميل ${member.id}`);
                                    const musicPlayer = playAudio(connection, selectedAudioSet.background, member.id, true, selectedAudioSet);
                                    callData.musicPlayer = musicPlayer;
                                    callData.waitingPlayer = null;
                                }
                            }
                        });
                    }

                    activeCalls.set(member.id, callData);
                } else {
                    // إذا مفيش صوت انتظار، نبدأ الموسيقى مباشرة
                    console.log(`🎵 بدء موسيقى ${selectedAudioSet.background} مباشرة للعميل ${member.id}`);
                    const musicPlayer = playAudio(connection, selectedAudioSet.background, member.id, true, selectedAudioSet);
                    
                    const callData = {
                        connection,
                        musicPlayer,
                        userId: member.id,
                        voiceChannelId: voiceChannel.id,
                        guildId: voiceChannel.guild.id,
                        isBotMuted: false,
                        hasAdmin: false,
                        userName: member.user.tag,
                        joinedAt: Date.now(),
                        audioSet: selectedAudioSet
                    };
                    
                    activeCalls.set(member.id, callData);
                }

            }, 4000); // 4 ثواني فقط
            
        }
        
        // خروج من روم الانتظار أو الروم الخاص
        if (oldState.channelId && newState.channelId !== oldState.channelId) {
            const memberId = member.id;
            const memberName = member.user.tag;
            
            // البحث إذا الروم اللي طلع منه ده روم خاص
            const isPrivateRoom = privateRooms.has(oldState.channelId);
            
            // إذا كان روم خاص
            if (isPrivateRoom) {
                const roomData = privateRooms.get(oldState.channelId);
                
                // إذا العميل هو اللي طلع
                if (roomData.clientId === memberId) {
                    console.log(`👤 العميل خرج من الروم الخاص`);
                    
                    // جلب بيانات المكالمة
                    const callData = activeCalls.get(memberId);
                    if (callData) {
                        // تنظيف البيانات
                        activeCalls.delete(memberId);
                    }
                    
                    // حذف الروم الخاص بعد 3 ثواني
                    setTimeout(async () => {
                        await deletePrivateRoom(oldState.channel?.guild, oldState.channelId);
                        privateRooms.delete(oldState.channelId);
                    }, 3000);
                    
                } 
                // إذا المشرف هو اللي طلع
                else if (roomData.adminId === memberId) {
                    console.log(`👑 المشرف خرج من الروم الخاص`);
                    
                    // جلب بيانات المكالمة
                    const callData = activeCalls.get(roomData.clientId);
                    if (callData) {
                        // تنظيف البيانات
                        activeCalls.delete(roomData.clientId);
                    }
                    
                    // حذف الروم الخاص بعد 3 ثواني
                    setTimeout(async () => {
                        await deletePrivateRoom(oldState.channel?.guild, oldState.channelId);
                        privateRooms.delete(oldState.channelId);
                    }, 3000);
                }
                
                return;
            }
            
            // إذا كان روم الانتظار
            if (oldState.channelId === supportVoiceId) {
                // لو كان شخص معاه الرتبة المحددة
                if (member.roles.cache.has(adminRoleId)) {
                    console.log(`👑 ${memberName} (إدارة) خرج من روم الانتظار`);
                    return;
                }
                
                // لو كان عميل عادي
                console.log(`👤 ${memberName} خرج من روم الانتظار`);
                
                const callData = activeCalls.get(memberId);
                
                if (callData) {
                    // تنظيف الصوت
                    stopAllAudioForUser(memberId);
                    
                    // تنظيف البيانات
                    activeCalls.delete(memberId);
                }
                
                // إذا مفيش أحد في روم الانتظار، اقطع الاتصال
                setTimeout(async () => {
                    try {
                        const channel = await client.channels.fetch(supportVoiceId);
                        if (channel) {
                            const members = channel.members.filter(m => !m.user.bot);
                            
                            if (members.size === 0) {
                                const conn = voiceConnections.get(guildId);
                                if (conn) {
                                    conn.destroy();
                                    voiceConnections.delete(guildId);
                                    console.log(`🔌 البوت طلع من روم الانتظار (فارغ)`);
                                }
                            }
                        }
                    } catch (error) {
                        // تجاهل الخطأ
                    }
                }, 3000);
            }
        }
        
    } catch (error) {
        console.error('❌ خطأ في voiceStateUpdate:', error);
    }
});

// حدث دخول البوت لسيرفر جديد
client.on('guildCreate', async (guild) => {
    console.log(`➕ تم إضافة البوت لسيرفر جديد: ${guild.name} (${guild.id})`);
    
    // التحقق إذا السيرفر مقفل
    const lockedServers = serverSettings.lockedServers || [];
    if (lockedServers.includes(guild.id)) {
        console.log(`🚫 السيرفر مقفل: ${guild.name}`);
        
        // إرسال رسالة للمالك
        try {
            const owner = await guild.fetchOwner();
            if (owner) {
                await owner.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xe74c3c)
                            .setTitle('🔒 البوت غير متاح في سيرفرك')
                            .setDescription(`**عذراً، البوت مقفل في سيرفرك (${guild.name})**\n\n**سبب القفل:** انتهاء الاشتراك أو مخالفة الشروط\n\n**موقع تجديد الاشتراك:** [https://siennaai.pages.dev/](https://siennaai.pages.dev/)`)
                            .addFields({
                                name: 'معلومات السيرفر',
                                value: `• **الاسم:** ${guild.name}\n• **المعرف:** \`${guild.id}\`\n• **الأعضاء:** ${guild.memberCount}`
                            })
                            .setFooter({ text: 'Sienna Support Bot' })
                            .setTimestamp()
                    ]
                });
            }
        } catch (error) {
            console.log(`❌ لم أستطع إرسال رسالة لمالك ${guild.name}`);
        }
        
        // خروج البوت من السيرفر
        setTimeout(async () => {
            try {
                await guild.leave();
                console.log(`🚫 البوت خرج من سيرفر (مقفل): ${guild.name}`);
            } catch (error) {
                console.log(`❌ فشل خروج البوت من ${guild.name}`);
            }
        }, 5000);
        
        return;
    }
    
    // إرسال رسالة ترحيب مع الرابط القابل للنقر
    try {
        const owner = await guild.fetchOwner();
        if (owner) {
            const welcomeEmbed = new EmbedBuilder()
                .setColor(0xFFFFFF)
                .setTitle('Holaa :> ')
                .setDescription('اهلا بك في خدمات Seinna')
                .addFields({
                    name: ' ',
                    value: 'Enjoy→⋰⋱⋮ لو عندك اقتراح او مشكله في استخدام تواصل في سيرفر خاص بينا :> اتمني لك يوم سعيد'
                })
                .setThumbnail('https://cdn.discordapp.com/attachments/1436754107389186224/1469829032987201716/c8a298442bf48444e67e4c288a73cabb.jpg?ex=69891475&is=6987c2f5&hm=eadf3863d18ec18df5bb97283c7f3b612c6cc10c04a7d536bc6a749d137475f8&')
                .setImage('https://cdn.discordapp.com/attachments/1436754107389186224/1469829032647590158/d801b3d8e619ae05aedcbefe7b8a5188.jpg?ex=69891475&is=6987c2f5&hm=bcc07ef69b6369dbb82b057b4362ebc56c181ecac2fd37547bb638b326a50bd2&')
                .setFooter({ 
                    text: `Sienna Support Bot | ${new Date().toLocaleDateString('ar-SA')}`, 
                    iconURL: 'https://cdn.discordapp.com/attachments/1449057765397106830/1459265170584109067/8ed9b44c0b845fd2d1b092949bc83411.jpg?ex=69898a58&is=698838d8&hm=e64f57cb8ba535d347da7ea478c1400ff5da0d71018f631fc176bc96d51b9889&' 
                })
                .setTimestamp();

            // إرسال الرسالة مع الرابط القابل للنقر
            await owner.send({ 
                content: '[Holaa :>](https://discord.gg/1mec)', // رابط السيرفر الخاص بك هنا
                embeds: [welcomeEmbed] 
            });
            console.log(`📩 تم إرسال رسالة ترحيب لمالك السيرفر: ${owner.user.tag}`);
        }
    } catch (error) {
        console.log(`❌ لم أستطع إرسال رسالة ترحيب لمالك ${guild.name}:`, error.message);
    }
    
    // إرسال رسالة ترحيب للإدمنز أيضاً
    const admins = guild.members.cache.filter(member => 
        member.permissions.has(PermissionsBitField.Flags.Administrator) && !member.user.bot
    );
    
    for (const admin of admins.values()) {
        try {
            if (admin.id !== guild.ownerId) {
                const helpEmbed = new EmbedBuilder()
                    .setColor(0x3498db)
                    .setTitle('👋 مرحباً بك في بوت الدعم الصوتي Sienna!')
                    .setDescription(`**شكراً لإضافتك البوت إلى ${guild.name}**\n\nقبل البدء، يجب إعداد النظام أولاً.`)
                    .addFields({
                        name: '📝 **الخطوات المطلوبة:**',
                        value: `
1. \`/setup category\`
2. \`/setup voice\`
3. \`/setup text\`
4. \`/setup role\`

بعدها النظام يصبح جاهزاً للعمل!
                        `
                    })
                    .setFooter({ text: 'استخدم /help لعرض كل الأوامر' });
                
                await admin.send({ embeds: [helpEmbed] });
                console.log(`📩 تم إرسال رسالة ترحيب للإدمن: ${admin.user.tag}`);
            }
        } catch (error) {
            // تجاهل الخطأ إذا لم نستطع إرسال
        }
    }
    
    // إرسال رسالة في قناة عامة في السيرفر (إذا كان هناك قناة مناسبة)
    try {
        // البحث عن أول قناة نصية يمكن للبوت الكتابة فيها
        const textChannel = guild.channels.cache
            .filter(ch => ch.type === ChannelType.GuildText && ch.permissionsFor(guild.members.me).has(PermissionsBitField.Flags.SendMessages))
            .first();
        
        if (textChannel) {
            const publicEmbed = new EmbedBuilder()
                .setColor(0xFFFFFF)
                .setTitle(':> مرحباً بالجميع!')
                .setDescription(`**تمت إضافة بوت Sienna بنجاح إلى ${guild.name}`)
                .addFields({
                    name: '📝 الخطوات الأولية',
                    value: ' استخدم `/help` لعرض الأوامر'
                })
                .setFooter({ text: 'Sienna Support Bot | نظام دعم صوتي متكامل' })
                .setTimestamp();
            
            await textChannel.send({ embeds: [publicEmbed] });
            console.log(`📢 تم إرسال رسالة ترحيب في قناة ${textChannel.name}`);
        }
    } catch (error) {
        console.log(`❌ لم أستطع إرسال رسالة ترحيب في السيرفر ${guild.name}`);
    }
});

// حدث تشغيل البوت
client.on('ready', async () => {
    console.log('=================================');
    console.log(`✅ ${client.user.tag} يعمل بنجاح!`);
    console.log(`📁 السيرفرات: ${client.guilds.cache.size}`);
    
    // حساب السيرفرات المقفلة
    const lockedServers = serverSettings.lockedServers || [];
    const allLockedCount = lockedServers.length;
    const activeLocked = lockedServers.filter(id => client.guilds.cache.has(id)).length;
    console.log(`🔐 السيرفرات المقفلة: ${allLockedCount} (${activeLocked} موجودة)`);
    
    // تسجيل الـ Slash Commands
    await registerCommands();
    
    // التحقق من كل سيرفر وإرسال تحذير إذا لم يكتمل الإعداد
    client.guilds.cache.forEach(guild => {
        if (!isServerSetupComplete(guild.id)) {
            console.log(`⚠️  سيرفر ${guild.name} (${guild.id}) غير مكتمل الإعداد`);
            warnAdminIfNotSetup(guild);
        } else {
            console.log(`✅ سيرفر ${guild.name} (${guild.id}) مكتمل الإعداد`);
        }
    });
    
    console.log('=================================');
    
    client.user.setPresence({
        activities: [{
            name: 'Sienna Support Bot | /help',
            type: 2
        }],
        status: 'online'
    });
});

// تسجيل الدخول
if (!config.token) {
    console.error('❌ المتغير البيئي DISCORD_TOKEN غير معبأ. أضف التوكن ثم أعد التشغيل.');
    process.exit(1);
}
client.login(config.token).catch(err => console.error('❌ فشل تسجيل الدخول:', err));

// معالجة الأخطاء
process.on('unhandledRejection', error => {
    console.error('❌ خطأ غير معالج:', error);
});

process.on('uncaughtException', error => {
    console.error('❌ استثناء غير معالج:', error);
});

// تنظيف الاتصالات عند إيقاف العملية
process.on('SIGINT', async () => {
    console.log('🛑 إغلاق - تنظيف الاتصالات الصوتية');
    for (const [guildId, conn] of voiceConnections.entries()) {
        try { conn.destroy(); } catch (e) {}
        voiceConnections.delete(guildId);
    }
    process.exit(0);
});