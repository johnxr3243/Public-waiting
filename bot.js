const { Client, GatewayIntentBits, EmbedBuilder, ChannelType, PermissionsBitField } = require('discord.js');
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
const prefix = process.env.PREFIX || '!';
const config = {
    token: process.env.DISCORD_TOKEN
};

// إضافة معرف المالك
const BOT_OWNER_ID = '1423320282281676878';

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
                            .setDescription(`**نظام الدعم في ${guild.name} غير مكتمل الإعداد!**\n\nالرجاء استخدام الأمر \`${prefix}help\` في سيرفر ${guild.name} لعرض أوامر الإعداد.`)
                            .addFields({
                                name: 'الأوامر الأساسية المطلوبة',
                                value: `\`${prefix}setup category <ID>\`\n\`${prefix}setup voice <ID>\`\n\`${prefix}setup text <ID>\`\n\`${prefix}setup role <ID>\``
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

// ================ نظام الأوامر ================

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    
    // الحصول على إعدادات السيرفر
    let settings = getServerSettings(message.guild.id);
    if (!settings) {
        settings = {
            audioSetId: 'set1'
        };
        serverSettings[message.guild.id] = settings;
    }
    
    // التحقق من الصلاحيات (فقط للأوامر التي تبدأ بـ prefix)
    if (message.content.startsWith(prefix)) {
        if (!canUseSetupCommands(message.member, message.guild, settings)) {
            // محاولة مسح رسالة المستخدم
            try {
                await message.delete();
            } catch (error) {
                console.log('❌ لم أستطع حذف رسالة المستخدم');
            }
            return;
        }
    }
    
    // إذا لم تكن تبدأ بـ prefix، تجاهل
    if (!message.content.startsWith(prefix)) return;
    
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    // أمر المساعدة
    if (command === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle('🆘 مركز المساعدة - بوت الدعم الصوتي')
            .setDescription('**قائمة الأوامر المتاحة للإدارة**\n\n**📍 بادئة الأوامر:** `' + prefix + '`')
            .addFields(
                { 
                    name: '📝 **الخطوة الأولى: الإعداد الإجباري**', 
                    value: `
**يجب تنفيذ هذه الخطوات بالترتيب:**

1️⃣ **\`${prefix}setup category <ID_التصنيف>\`**
• تحديد تصنيف للغرف الخاصة
• **الهدف:** هنا بيتنشأ الرومات الخاصة
• **مثال:** \`${prefix}setup category 123456789012345678\`

2️⃣ **\`${prefix}setup voice <ID_روم_الصوت>\`**
• تحديد روم الانتظار الصوتي
• **الهدف:** هنا العملاء بيدخلوا يستنوا الدعم
• **مثال:** \`${prefix}setup voice 123456789012345678\`

3️⃣ **\`${prefix}setup text <ID_روم_النص>\`**
• تحديد روم إرسال الإشعارات
• **الهدف:** هنا بيرسل البوت إشعارات بوجود عملاء
• **مثال:** \`${prefix}setup text 123456789012345678\`

4️⃣ **\`${prefix}setup role <ID_رتبة_الإدارة>\`**
• تحديد رتبة الإدارة
• **الهدف:** مين اللي هيقدر يدخل يستقبل العملاء؟
• **مثال:** \`${prefix}setup role 123456789012345678\`
                    `
                },
                { 
                    name: '🎵 **الخطوة الثانية: إعدادات الصوت (اختياري)**', 
                    value: `
**\`${prefix}setup waiting <set1|set2|set3>\`**
• اختيار مجموعة الصوت
• **set1:** صوت انتظار عادي + موسيقى خلفية
• **set2:** صوت انتظار مختلف + موسيقى مختلفة
• **set3:** موسيقى فقط بدون صوت انتظار
• **مثال:** \`${prefix}setup waiting set2\`
                    `
                },
                { 
                    name: '👁️ **أوامر العرض والتحكم**', 
                    value: `
**\`${prefix}setup show\`**
• عرض الإعدادات الحالية
• **الهدف:** شوف كل الإعدادات بشكل منظم

**\`${prefix}reset\`**
• مسح كل الإعدادات
• **تحذير:** بيرجع كل حاجة للنقطة صفر!
• **الاستخدام:** للتصحيح أو إعادة الإعداد

**\`${prefix}help\`**
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
4. **رسائل البوت بتنحذف** بعد ما تنتهي العملية
                    `
                },
                {
                    name: '📚 **كيف تجيب الـ ID؟**',
                    value: `
1. فتح **Settings → Advanced → Developer Mode**
2. كليك يمين على أي قناة أو رتبة → **Copy ID**
                    `
                },
                {
                    name: '🎥 **شرح مفصل**',
                    value: '🔗 [اضغط هنا لمشاهدة شرح البوت على اليوتيوب](https://youtube.com/@yoursupportbot)'
                }
            )
            .setFooter({ 
                text: `البادئة الحالية: ${prefix} | السيرفر: ${message.guild.name} | حالة الإعدادات: ${isServerSetupComplete(message.guild.id) ? '✅ مكتملة' : '❌ غير مكتملة'}` 
            })
            .setTimestamp();
        
        const helpMessage = await message.reply({ embeds: [helpEmbed] });
        
        // مسح رسالة المستخدم بعد 10 ثواني
        setTimeout(async () => {
            try {
                await message.delete();
            } catch (error) {
                console.log('❌ لم أستطع حذف رسالة المستخدم');
            }
        }, 10000);
        
        // مسح رسالة البوت بعد 30 ثانية
        setTimeout(async () => {
            try {
                await helpMessage.delete();
            } catch (error) {
                console.log('❌ لم أستطع حذف رسالة البوت');
            }
        }, 30000);
        
        return;
    }
    
    // أمر عرض الإعدادات
    if (command === 'setup' && args[0] === 'show') {
        const settingsText = formatSettings(message.guild, settings);
        
        const embed = new EmbedBuilder()
            .setColor(isServerSetupComplete(message.guild.id) ? 0x2ecc71 : 0xe74c3c)
            .setTitle('⚙️ الإعدادات الحالية')
            .setDescription(settingsText)
            .setFooter({ 
                text: isServerSetupComplete(message.guild.id) 
                    ? '✅ النظام جاهز للعمل' 
                    : '❌ النظام غير مكتمل - استخدم أوامر الإعداد' 
            })
            .setTimestamp();
        
        const replyMsg = await message.reply({ embeds: [embed] });
        
        // مسح رسالة المستخدم بعد 5 ثواني
        setTimeout(async () => {
            try {
                await message.delete();
            } catch (error) {
                console.log('❌ لم أستطع حذف رسالة المستخدم');
            }
        }, 5000);
        
        // مسح رسالة البوت بعد 15 ثانية
        setTimeout(async () => {
            try {
                await replyMsg.delete();
            } catch (error) {
                console.log('❌ لم أستطع حذف رسالة البوت');
            }
        }, 15000);
        
        return;
    }
    
    // أمر إعداد الصوت
    if (command === 'setup' && args[0] === 'waiting') {
        const audioSetId = args[1];
        const audioSet = audioSets.find(set => set.id === audioSetId);
        
        if (!audioSet) {
            const availableSets = audioSets.map(set => `\`${set.id}\` - ${set.name}`).join('\n');
            const errorMsg = await message.reply(`❌ **مجموعة صوت غير صالحة!**\n\n**المجموعات المتاحة:**\n${availableSets}`);
            
            // مسح الرسائل بعد وقت
            setTimeout(async () => {
                try {
                    await message.delete();
                    await errorMsg.delete();
                } catch (error) {
                    console.log('❌ لم أستطع حذف الرسائل');
                }
            }, 10000);
            return;
        }
        
        settings.audioSetId = audioSetId;
        serverSettings[message.guild.id] = settings;
        saveSettings(serverSettings);
        
        const successMsg = await message.reply(`✅ **تم تحديث مجموعة الصوت بنجاح!**\n🎵 **المجموعة الجديدة:** ${audioSet.name}`);
        
        setTimeout(async () => {
            try {
                await message.delete();
                await successMsg.delete();
            } catch (error) {
                console.log('❌ لم أستطع حذف الرسائل');
            }
        }, 10000);
        return;
    }
    
    // أمر إعداد التصنيف
    if (command === 'setup' && args[0] === 'category') {
        const categoryId = args[1];
        
        if (!categoryId) {
            const errorMsg = await message.reply(`❌ **يجب إدخال ID التصنيف!**\nمثال: \`${prefix}setup category 123456789012345678\``);
            
            setTimeout(async () => {
                try {
                    await message.delete();
                    await errorMsg.delete();
                } catch (error) {
                    console.log('❌ لم أستطع حذف الرسائل');
                }
            }, 10000);
            return;
        }
        
        const category = await message.guild.channels.fetch(categoryId).catch(() => null);
        
        if (!category || category.type !== ChannelType.GuildCategory) {
            const errorMsg = await message.reply('❌ **التصنيف غير موجود أو ليس تصنيفاً صالحاً!**');
            
            setTimeout(async () => {
                try {
                    await message.delete();
                    await errorMsg.delete();
                } catch (error) {
                    console.log('❌ لم أستطع حذف الرسائل');
                }
            }, 10000);
            return;
        }
        
        settings.categoryId = categoryId;
        serverSettings[message.guild.id] = settings;
        saveSettings(serverSettings);
        
        if (isServerSetupComplete(message.guild.id)) {
            const successMsg = await message.reply(`✅ **تم تحديث التصنيف بنجاح!**\n📂 **التصنيف:** ${category.name}\n\n🎉 **تهانينا!** النظام أصبح جاهزاً للعمل!`);
            
            setTimeout(async () => {
                try {
                    await message.delete();
                    await successMsg.delete();
                } catch (error) {
                    console.log('❌ لم أستطع حذف الرسائل');
                }
            }, 15000);
        } else {
            const successMsg = await message.reply(`✅ **تم تحديث التصنيف بنجاح!**\n📂 **التصنيف:** ${category.name}\n\n⚠️ **مطلوب:** لا تزال تحتاج إلى إعداد روم الصوت وروم النص ورتبة الإدارة.`);
            
            setTimeout(async () => {
                try {
                    await message.delete();
                    await successMsg.delete();
                } catch (error) {
                    console.log('❌ لم أستطع حذف الرسائل');
                }
            }, 15000);
        }
        return;
    }
    
    // أمر إعداد روم الصوت
    if (command === 'setup' && args[0] === 'voice') {
        const voiceId = args[1];
        
        if (!voiceId) {
            const errorMsg = await message.reply(`❌ **يجب إدخال ID روم الصوت!**\nمثال: \`${prefix}setup voice 123456789012345678\``);
            
            setTimeout(async () => {
                try {
                    await message.delete();
                    await errorMsg.delete();
                } catch (error) {
                    console.log('❌ لم أستطع حذف الرسائل');
                }
            }, 10000);
            return;
        }
        
        const voiceChannel = await message.guild.channels.fetch(voiceId).catch(() => null);
        
        if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
            const errorMsg = await message.reply('❌ **القناة غير موجودة أو ليست روم صوت!**');
            
            setTimeout(async () => {
                try {
                    await message.delete();
                    await errorMsg.delete();
                } catch (error) {
                    console.log('❌ لم أستطع حذف الرسائل');
                }
            }, 10000);
            return;
        }
        
        settings.voiceId = voiceId;
        serverSettings[message.guild.id] = settings;
        saveSettings(serverSettings);
        
        if (isServerSetupComplete(message.guild.id)) {
            const successMsg = await message.reply(`✅ **تم تحديث روم الانتظار بنجاح!**\n🎧 **الروم:** ${voiceChannel.name}\n\n🎉 **تهانينا!** النظام أصبح جاهزاً للعمل!`);
            
            setTimeout(async () => {
                try {
                    await message.delete();
                    await successMsg.delete();
                } catch (error) {
                    console.log('❌ لم أستطع حذف الرسائل');
                }
            }, 15000);
        } else {
            const successMsg = await message.reply(`✅ **تم تحديث روم الانتظار بنجاح!**\n🎧 **الروم:** ${voiceChannel.name}\n\n⚠️ **مطلوب:** لا تزال تحتاج إلى إعداد التصنيف وروم النص ورتبة الإدارة.`);
            
            setTimeout(async () => {
                try {
                    await message.delete();
                    await successMsg.delete();
                } catch (error) {
                    console.log('❌ لم أستطع حذف الرسائل');
                }
            }, 15000);
        }
        return;
    }
    
    // أمر إعداد روم النص
    if (command === 'setup' && args[0] === 'text') {
        const textId = args[1];
        
        if (!textId) {
            const errorMsg = await message.reply(`❌ **يجب إدخال ID روم النص!**\nمثال: \`${prefix}setup text 123456789012345678\``);
            
            setTimeout(async () => {
                try {
                    await message.delete();
                    await errorMsg.delete();
                } catch (error) {
                    console.log('❌ لم أستطع حذف الرسائل');
                }
            }, 10000);
            return;
        }
        
        const textChannel = await message.guild.channels.fetch(textId).catch(() => null);
        
        if (!textChannel || textChannel.type !== ChannelType.GuildText) {
            const errorMsg = await message.reply('❌ **القناة غير موجودة أو ليست روم نص!**');
            
            setTimeout(async () => {
                try {
                    await message.delete();
                    await errorMsg.delete();
                } catch (error) {
                    console.log('❌ لم أستطع حذف الرسائل');
                }
            }, 10000);
            return;
        }
        
        settings.textId = textId;
        serverSettings[message.guild.id] = settings;
        saveSettings(serverSettings);
        
        if (isServerSetupComplete(message.guild.id)) {
            const successMsg = await message.reply(`✅ **تم تحديث روم الإشعارات بنجاح!**\n💬 **الروم:** ${textChannel.name}\n\n🎉 **تهانينا!** النظام أصبح جاهزاً للعمل!`);
            
            setTimeout(async () => {
                try {
                    await message.delete();
                    await successMsg.delete();
                } catch (error) {
                    console.log('❌ لم أستطع حذف الرسائل');
                }
            }, 15000);
        } else {
            const successMsg = await message.reply(`✅ **تم تحديث روم الإشعارات بنجاح!**\n💬 **الروم:** ${textChannel.name}\n\n⚠️ **مطلوب:** لا تزال تحتاج إلى إعداد التصنيف وروم الصوت ورتبة الإدارة.`);
            
            setTimeout(async () => {
                try {
                    await message.delete();
                    await successMsg.delete();
                } catch (error) {
                    console.log('❌ لم أستطع حذف الرسائل');
                }
            }, 15000);
        }
        return;
    }
    
    // أمر إعداد رتبة الإدارة
    if (command === 'setup' && args[0] === 'role') {
        const roleId = args[1];
        
        if (!roleId) {
            const errorMsg = await message.reply(`❌ **يجب إدخال ID رتبة الإدارة!**\nمثال: \`${prefix}setup role 123456789012345678\``);
            
            setTimeout(async () => {
                try {
                    await message.delete();
                    await errorMsg.delete();
                } catch (error) {
                    console.log('❌ لم أستطع حذف الرسائل');
                }
            }, 10000);
            return;
        }
        
        const role = await message.guild.roles.fetch(roleId).catch(() => null);
        
        if (!role) {
            const errorMsg = await message.reply('❌ **الرتبة غير موجودة!**');
            
            setTimeout(async () => {
                try {
                    await message.delete();
                    await errorMsg.delete();
                } catch (error) {
                    console.log('❌ لم أستطع حذف الرسائل');
                }
            }, 10000);
            return;
        }
        
        settings.adminRoleId = roleId;
        serverSettings[message.guild.id] = settings;
        saveSettings(serverSettings);
        
        if (isServerSetupComplete(message.guild.id)) {
            const successMsg = await message.reply(`✅ **تم تحديث رتبة الإدارة بنجاح!**\n👑 **الرتبة:** ${role.name}\n\n🎉 **تهانينا!** النظام أصبح جاهزاً للعمل!`);
            
            setTimeout(async () => {
                try {
                    await message.delete();
                    await successMsg.delete();
                } catch (error) {
                    console.log('❌ لم أستطع حذف الرسائل');
                }
            }, 15000);
        } else {
            const successMsg = await message.reply(`✅ **تم تحديث رتبة الإدارة بنجاح!**\n👑 **الرتبة:** ${role.name}\n\n⚠️ **مطلوب:** لا تزال تحتاج إلى إعداد التصنيف وروم الصوت وروم النص.`);
            
            setTimeout(async () => {
                try {
                    await message.delete();
                    await successMsg.delete();
                } catch (error) {
                    console.log('❌ لم أستطع حذف الرسائل');
                }
            }, 15000);
        }
        return;
    }
    
    // أمر إرسال رسالة للمالك (خاص بالمالك فقط)
    if (command === 'broadcast' && message.author.id === BOT_OWNER_ID) {
        const messageContent = args.join(' ');
        
        if (!messageContent) {
            const errorMsg = await message.reply('❌ **يجب كتابة الرسالة!**\nمثال: `!broadcast هناك تحديث جديد للبوت...`');
            
            setTimeout(async () => {
                try {
                    await message.delete();
                    await errorMsg.delete();
                } catch (error) {}
            }, 10000);
            return;
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
                                    text: `Sienna Support Bot | ${current}/${totalServers}`, 
                                    iconURL: 'https://cdn.discordapp.com/attachments/your-image-url/sienna-icon.png' 
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
                    
                    // تحديث حالة الإرسال كل 5 سيرفرات
                    if (current % 5 === 0 || current === totalServers) {
                        await confirmMessage.edit({
                            embeds: [
                                new EmbedBuilder()
                                    .setColor(0x3498db)
                                    .setTitle('📤 جاري الإرسال...')
                                    .setDescription(`جاري إرسال الرسالة لجميع مالكي السيرفرات...\n\n**التقدم:** ${current}/${totalServers}\n**الناجح:** ${successCount}\n**الفاشل:** ${failCount}`)
                                    .setFooter({ text: 'قد يستغرق هذا بعض الوقت' })
                            ]
                        });
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
                
                // مسح رسالة المستخدم بعد 20 ثانية
                setTimeout(async () => {
                    try {
                        await message.delete();
                        await confirmMessage.delete();
                    } catch (error) {
                        console.log('❌ لم أستطع حذف الرسائل');
                    }
                }, 20000);
            } else {
                await confirmMessage.edit({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xf39c12)
                            .setTitle('❌ تم إلغاء العملية')
                            .setDescription('لم يتم إرسال الرسالة.')
                    ]
                });
                
                setTimeout(async () => {
                    try {
                        await confirmMessage.delete();
                        await message.delete();
                    } catch (error) {
                        console.log('❌ لم أستطع حذف الرسائل');
                    }
                }, 10000);
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
            
            setTimeout(async () => {
                try {
                    await confirmMessage.delete();
                    await message.delete();
                } catch (error) {
                    console.log('❌ لم أستطع حذف الرسائل');
                }
            }, 10000);
        }
        return;
    }
    
    // أمر المسح
    if (command === 'reset') {
        const confirmEmbed = new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle('⚠️ تأكيد مسح الإعدادات')
            .setDescription('هل أنت متأكد من مسح **كل إعدادات** هذا السيرفر؟\n\n**سيتم:**\n• حذف كل الإعدادات المخصصة\n• البوت سيتوقف عن العمل حتى تقوم بالإعداد من جديد')
            .setFooter({ text: 'اكتب "تأكيد" خلال 30 ثانية للمتابعة' });
        
        const confirmMessage = await message.reply({ embeds: [confirmEmbed] });
        
        const filter = m => m.author.id === message.author.id;
        try {
            const collected = await message.channel.awaitMessages({ 
                filter, 
                max: 1, 
                time: 30000, 
                errors: ['time'] 
            });
            
            if (collected.first().content === 'تأكيد') {
                delete serverSettings[message.guild.id];
                saveSettings(serverSettings);
                
                await confirmMessage.edit({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x2ecc71)
                            .setTitle('✅ تم مسح الإعدادات بنجاح')
                            .setDescription('تم حذف كل الإعدادات المخصصة لهذا السيرفر.\n\n**يجب الآن إعادة الإعداد باستخدام:**')
                            .addFields(
                                { name: '1. إعداد التصنيف', value: `\`${prefix}setup category <ID>\``, inline: false },
                                { name: '2. إعداد روم الصوت', value: `\`${prefix}setup voice <ID>\``, inline: false },
                                { name: '3. إعداد روم النص', value: `\`${prefix}setup text <ID>\``, inline: false },
                                { name: '4. إعداد رتبة الإدارة', value: `\`${prefix}setup role <ID>\``, inline: false }
                            )
                            .setFooter({ text: 'استخدم !help لعرض كل الأوامر' })
                    ]
                });
                
                setTimeout(async () => {
                    try {
                        await confirmMessage.delete();
                        await message.delete();
                    } catch (error) {
                        console.log('❌ لم أستطع حذف الرسائل');
                    }
                }, 20000);
            } else {
                await confirmMessage.edit({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xf39c12)
                            .setTitle('❌ تم إلغاء العملية')
                            .setDescription('لم يتم مسح الإعدادات.')
                    ]
                });
                
                setTimeout(async () => {
                    try {
                        await confirmMessage.delete();
                        await message.delete();
                    } catch (error) {
                        console.log('❌ لم أستطع حذف الرسائل');
                    }
                }, 10000);
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
            
            setTimeout(async () => {
                try {
                    await confirmMessage.delete();
                    await message.delete();
                } catch (error) {
                    console.log('❌ لم أستطع حذف الرسائل');
                }
            }, 10000);
        }
        return;
    }
    
    if (command === 'setup') {
        const errorMsg = await message.reply(`❌ **استخدام خاطئ!**\n\nاستخدم \`${prefix}help\` لعرض الأوامر المتاحة.`);
        
        setTimeout(async () => {
            try {
                await message.delete();
                await errorMsg.delete();
            } catch (error) {
                console.log('❌ لم أستطع حذف الرسائل');
            }
        }, 10000);
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
    
    // إرسال رسالة ترحيب لمالك السيرفر
    try {
        const owner = await guild.fetchOwner();
        if (owner) {
            const welcomeEmbed = new EmbedBuilder()
                .setColor(0xFFFFFF) // لون أبيض
                .setTitle('Holaa 👋🏻')
                .setDescription('سهل بک في خدمات Sienna')
                .addFields({
                    name: ' ',
                    value: 'لو عندك اقتراح او مشكلة في استخدام تواصل في سيرفر خاص بيذا :\n\nاتمني لك يوم سعيد'
                })
                .setThumbnail('https://cdn.discordapp.com/attachments/your-image-url/sienna-character.png') // صورة الشخصية
                .setImage('https://cdn.discordapp.com/attachments/your-image-url/white-cloud.png') // صورة السحابة البيضاء
                .setFooter({ 
                    text: `Sienna Support Bot | ${new Date().toLocaleDateString('ar-SA')}`, 
                    iconURL: 'https://cdn.discordapp.com/attachments/your-image-url/sienna-icon.png' 
                })
                .setTimestamp();

            await owner.send({ embeds: [welcomeEmbed] });
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
            if (admin.id !== guild.ownerId) { // تجنب إرسال مزدوج للمالك
                const helpEmbed = new EmbedBuilder()
                    .setColor(0x3498db)
                    .setTitle('👋 مرحباً بك في بوت الدعم الصوتي Sienna!')
                    .setDescription(`**شكراً لإضافتك البوت إلى ${guild.name}**\n\nقبل البدء، يجب إعداد النظام أولاً.`)
                    .addFields({
                        name: '📝 **الخطوات المطلوبة:**',
                        value: `
1. \`${prefix}setup category <ID_التصنيف>\`
2. \`${prefix}setup voice <ID_روم_الصوت>\`
3. \`${prefix}setup text <ID_روم_النص>\`
4. \`${prefix}setup role <ID_الرتبة>\`

بعدها النظام يصبح جاهزاً للعمل!
                        `
                    })
                    .setFooter({ text: 'استخدم !help لعرض كل الأوامر' });
                
                await admin.send({ embeds: [helpEmbed] });
                console.log(`📩 تم إرسال رسالة ترحيب للإدمن: ${admin.user.tag}`);
            }
        } catch (error) {
            // تجاهل الخطأ إذا لم نستطع إرسال
        }
    }
});

// حدث تشغيل البوت
client.on('ready', async () => {
    console.log('=================================');
    console.log(`✅ ${client.user.tag} يعمل بنجاح!`);
    console.log(`🔤 Prefix: ${prefix}`);
    console.log(`📁 السيرفرات: ${client.guilds.cache.size}`);
    
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
            name: 'System Support Ai',
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