import { Composer, Scenes } from "telegraf";
import rlhubContext from "../models/rlhubContext";
import { IUser, User } from "../../models/IUser";
import { ChatModel, IChat } from "../../models/IChat";
import greeting from "./chatView/chat.greeting";
import create_new_chat_handler from "./chatView/createNewChat";
import { ObjectId, model } from "mongoose";
import { sendRequest } from "./chatView/sendRequest";
import { ExtraEditMessageText, ExtraReplyMessage } from "telegraf/typings/telegram-types";
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.apikey, });

const handler = new Composer<rlhubContext>();
const chat = new Scenes.WizardScene("chatgpt", handler,
    async (ctx: rlhubContext) => await create_new_chat_handler(ctx), // не работает
    async (ctx: rlhubContext) => await new_chat_handler(ctx),
    async (ctx: rlhubContext) => await select_chat_handler(ctx),
    async (ctx: rlhubContext) => await saving_dialog(ctx),
    async (ctx: rlhubContext) => await onload_dialog_handler(ctx),
    async (ctx: rlhubContext) => await instructionSceneHandler(ctx),
    async (ctx: rlhubContext) => await settingsChatGPTSectionHandler(ctx),
    async (ctx: rlhubContext) => await changeTokensSceneHandler(ctx),
    async (ctx: rlhubContext) => await changeModelSceneHandler(ctx),
    async (ctx: rlhubContext) => await changeTemperatureSceneHandler(ctx)
)

chat.enter(async (ctx: rlhubContext) => await greeting(ctx))

chat.command('main', async (ctx) => {
    return ctx.scene.enter('home')
})

// Генерация случайного целого числа от min до max
function getRandomInt(min: number, max: number) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

chat.action("list", async (ctx) => await render_list_dialogs(ctx))
async function render_list_dialogs(ctx: rlhubContext) {

    try {

        const user: IUser | null = await User.findOne({
            id: ctx.from?.id
        })

        let chats: IChat[] | null = []

        if (user?.chats) {
            for (let i = 0; i < user.chats.length; i++) {

                let dialog: IChat | null = await ChatModel.findById(user.chats[i])
                if (dialog) {

                    // console.log(dialog)
                    chats.push(dialog)

                }

            }
        }


        console.log(chats)

        let message: string = `<b>Мои диалоги</b>\n\n`

        message += `Количество созданных диалогов: <b>${chats.length}</b>\n`
        message += `Страница: <b>1/1</b>`

        let extra: ExtraEditMessageText = {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: []
            }
        }

        let row = []

        for (let i = 0; i < chats.length; i++) {

            // message += `${i + 1}. ${chats[i].name} \n`

            let dialog_name: string | undefined = chats[i].name

            if (dialog_name) {
                let shortedString = dialog_name?.length > 20 ? dialog_name?.substring(0, 20) + "..." : dialog_name
                row.push({ text: `${shortedString}`, callback_data: `${i} chat` })

                if (row.length == 2) {
                    extra.reply_markup.inline_keyboard.push(row)
                    row = []
                }
                // extra.reply_markup?.inline_keyboard.push([{ text: `${shortedString}`, callback_data: '${i} chat' }])

            } else {
                console.log('hasnt name')
                await User.findByIdAndUpdate(user._id, {
                    $pull: {
                        chats: chats[i]._id
                    }
                })

                return await render_list_dialogs(ctx)


            }

        }

        if (row.length > 0) {
            extra.reply_markup.inline_keyboard.push(row)
        }

        console.log(extra.reply_markup.inline_keyboard)

        extra.reply_markup?.inline_keyboard.push([{ text: 'Назад', callback_data: 'back' }])

        await ctx.editMessageText(message, extra).then(() => ctx.wizard.selectStep(3))

    } catch (error) {

        ctx.answerCbQuery("Возникла ошибка")
        console.error(error)

    }

}
handler.action("home", async (ctx: rlhubContext) => {
    try {

        ctx.answerCbQuery()
        return await ctx.scene.enter('home')

    } catch (error) {

        console.error(error)

    }
})

handler.action("new_chat", async (ctx) => {

    try {

        // находим пользователя

        const user: IUser | null = await User.findOne({
            id: ctx.from?.id
        })

        if (!user || !user._id) {
            return ctx.answerCbQuery("Пользователь не найден!")
        }

        if (user.access_tokens === 0) {
            
            const message: string = `<a href="https://telegra.ph/Kak-priobresti-tokeny-10-21">Как приобрести токены?</a>`
            await ctx.editMessageText(message, { parse_mode: 'HTML', disable_web_page_preview: true })
            await greeting(ctx, true)
            return ctx.answerCbQuery("Закончились токены 🪫 😔")
        }

        // уведомление о создании комнаты
        
        let message: string = `Создание комнаты ...`
        await ctx.editMessageText(message, { parse_mode: 'HTML' })

        await ctx.telegram.sendChatAction(ctx.from.id, "typing")

        let chat: IChat | undefined = {
            user_id: user._id,
            context: [
                { role: "system", content: "Твой API подключен к телеграмм боту, ты будешь сейчас переписываться с пользователем, поприветствуй пользователя" },
            ]
        }

        await clear_chats(user)

        // await ChatModel.findById()

        await new ChatModel(chat).save().then((async (response) => {

            if (!user) {
                return ctx.answerCbQuery("Пользователь не найден!")
            }

            await User.findByIdAndUpdate(user._id, { $push: { chats: response._id } })

            // сохраняем айди чата в контекст бота 
            ctx.scene.session.current_chat = response._id

        }))

        // console.log(ctx.scene.session.current_chat)

        let current_chat: ObjectId = ctx.scene.session.current_chat
        let old = await ChatModel.findById(current_chat)

        if (chat && chat.context) {
            await ChatModel.findById(current_chat).then(async (document: IChat | null) => {

                await openai.chat.completions.create({
                    model: user.gpt_model,
                    temperature: user.temperature / 100,
                    max_tokens: 2000,
                    // @ts-ignore
                    messages: old.context,
                }).then(async (response) => {

                    if (response) {

                        if (response.choices[0].message?.content) {

                            const left = user.access_tokens - response.usage.total_tokens

                            await ctx.editMessageText(response.choices[0].message?.content + `\n\n<code>Затрачено токенов: ${response.usage.total_tokens}</code>\n<code>Осталось: ${left > 0 ? left : 0 }</code>`, { parse_mode: 'HTML' })
                            
                            await User.findByIdAndUpdate(user._id, {
                                $set: {
                                    access_tokens: left > 0 ? left : 0
                                }
                            }).then(() => {
                                console.log('токены вытчены')
                            })

                            ctx.wizard.selectStep(2)
                        }

                        await ChatModel.findByIdAndUpdate(document?._id, {
                            $push: {
                                context: response.choices[0].message
                            }
                        })

                    }

                }).catch(async (error) => {
                    console.error(error.response.data)
                })

            })
        }

    } catch (error) {

        console.error(error)
        return await greeting(ctx)

    }

})

export async function clear_chats(user: IUser) {
    try {

        if (!user.chats) {
            return false
        }

        user.chats.forEach(async (element: ObjectId, index: number) => {
            if (element) {

                const dialog: IChat | null = await ChatModel.findById(element)

                if (dialog) {
                    if (!dialog.name) {

                        await ChatModel.findByIdAndDelete(dialog._id).then(async () => {
                            console.log(`${dialog._id} удалён`)
                            await User.findByIdAndUpdate(user._id, {
                                $pull: {
                                    chats: dialog._id
                                }
                            }).then(async () => {
                                console.log(`${dialog._id} удалён из записей пользователя`)
                            })
                        })

                    }
                }

            }
        });

    } catch (error) {

        console.error(error)

    }
}

handler.action("chats", async (ctx) => {

    ctx.wizard.selectStep(3)
    ctx.answerCbQuery()

    let user = await User.findOne({
        id: ctx.from?.id
    })

    let chats = await ChatModel.find({
        user_id: user?._id
    })

    const itemsOnPerPage = 5

    if (chats.length) {
        if (chats.length > itemsOnPerPage) {

            const pages = Math.ceil(chats.length / itemsOnPerPage)
            const sliced = chats.slice(0, itemsOnPerPage)

            sliced.forEach(async (element) => {
                console.log(element.name)
            })

        } else {

            let message: string = 'Выберите чат, с которым хотите продолжить работу'
            let extra: ExtraEditMessageText = {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: []
                }
            }

            chats.forEach(async (chat) => {

            })

            extra.reply_markup?.inline_keyboard.push([{ text: 'Назад', callback_data: 'back' }])
            await ctx.editMessageText(message, extra)
            ctx.wizard.selectStep(3)

        }
    }

})
handler.action("settings-chat-gpt", async (ctx) => await settingsChatGPTSectionRender(ctx))
async function settingsChatGPTSectionRender(ctx: rlhubContext) {
    try {

        let message: string = `<b>Chat GPT / Настройки</b>`

        const user = await User.findOne({ id: ctx.from.id })

        message += `\n\n<b>Надстройки GPT:</b>\n`
        message += `Модель GPT: <b>${user.gpt_model}</b>\n`
        message += `Максимальное количество токенов: <b>${user.max_tokens}</b>`

        let extra: ExtraEditMessageText = {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Выбрать языковую модель', callback_data: 'model' }],
                    [{ text: 'Изменить максимальное число токенов', callback_data: 'tokens' }],
                    [{ text: 'Настроить температуру', callback_data: 'temperature' }],
                    [{ text: 'Назад', callback_data: 'back' }]
                ]
            }
        }

        ctx.updateType === 'callback_query' ? ctx.editMessageText(message, extra) : ctx.reply(message, extra)
        ctx.wizard.selectStep(7)

    } catch (error) {
        console.error(error)
    }
}

async function changeTokensSceneRender(ctx: rlhubContext) {
    try {

        let message: string = `Отправьте значение для изменения параметра <code>max_tokens</code>`

        let extra: ExtraEditMessageText = {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Назад', callback_data: 'back' }]
                ]
            }
        }

        ctx.updateType === 'callback_query' ? ctx.editMessageText(message, extra) : ctx.reply(message, extra)
        ctx.wizard.selectStep(8)

    } catch (error) {
        console.error(error)
    }
}
async function changeTokensSceneHandler(ctx: rlhubContext) {
    try {

        if (ctx.updateType === 'callback_query') {

            const data: string = ctx.update.callback_query.data

            if (data === 'back') {
                await settingsChatGPTSectionRender(ctx)
            }

        }

        if (ctx.updateType === 'message') {

            let message: string = ctx.update.message.text

            if (parseFloat(message) > 0) {

                await ctx.reply(`${parseFloat(message)}`)

            } else {

                message = `Отправьте значение больше 0`
                await ctx.reply(message)

            }

        }

    } catch (error) {
        console.error(error)
    }
}
async function settingsChatGPTSectionHandler(ctx: rlhubContext) {
    try {

        if (ctx.updateType === 'callback_query') {

            const data: 'back' | 'tokens' | 'model' | 'temperature' = ctx.update.callback_query.data

            if (data === 'temperature') {
                await changeTemperatureSceneRender(ctx)
            }

            if (data === 'tokens') {
                await changeTokensSceneRender(ctx)
            }

            if (data === 'model') {

                await changeModelSceneRender(ctx)

            }

            if (data === 'back') {

                await greeting(ctx)

            }

            ctx.answerCbQuery()

        }

    } catch (error) {
        console.error(error)
    }
}
async function changeTemperatureSceneRender(ctx: rlhubContext) {
    try {

        let message: string = `Отправьте значение температуры, которое хотите установить (От 1 до 99)`
        let extra: ExtraEditMessageText = {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Назад', callback_data: 'back' }]
                ]
            }
        }

        ctx.updateType === 'callback_query' ? ctx.editMessageText(message, extra) : ctx.reply(message, extra)

        ctx.wizard.selectStep(10)

    } catch (error) {
        console.error(error)
    }
}
async function changeTemperatureSceneHandler(ctx: rlhubContext) {
    try {

        if (ctx.updateType === 'callback_query') {

            const data: string = ctx.update.callback_query.data

            if (data === 'back') {
                await settingsChatGPTSectionRender(ctx)
            }

        }

        if (ctx.updateType === 'message') {

            if (ctx.update.message.text) {

                const temp = ctx.update.message.text

                if ((parseFloat(temp) >= 1) && (parseFloat(temp) <= 99)) {

                    await ctx.reply(`${temp}`)

                } else {

                    const message: string = `Введите значние от 1 до 99`

                    await ctx.reply(message)

                }

            }

        }

    } catch (error) {
        console.error(error)
    }
}
handler.action("instruction", async (ctx) => await instructionRender(ctx))
async function instructionRender(ctx: rlhubContext) {
    try {

        let message: string = `<b>Chat GPT / Инструкция для пользования</b>\n\n`

        message += `<i><a href="https://telegra.ph/CHto-takoe-Chat-GPT-10-21">Что такое Chat GPT?</a></i>\n`
        message += `<i><a href="https://telegra.ph/CHto-takoe-tokeny-10-22">Что такое токены?</a></i>\n`
        message += `<i><a href="https://telegra.ph/CHto-takoe-temperatura-10-22">Что такое температура запроса?</a></i>\n`

        let extra: ExtraEditMessageText = {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Назад', callback_data: 'back' }]
                ]
            },
            disable_web_page_preview: true
        }

        ctx.updateType === 'callback_query' ? ctx.editMessageText(message, extra) : ctx.reply(message, extra)

        ctx.wizard.selectStep(6)

    } catch (error) {
        console.error()
    }
}

async function instructionSceneHandler(ctx: rlhubContext) {
    try {

        if (ctx.updateType === 'callback_query') {

            const data: string = ctx.update.callback_query.data

            if (data === 'back') {
                return greeting(ctx)
            }

            ctx.answerCbQuery(data)

        }

    } catch (error) {

        console.error(error)

    }
}

async function changeModelSceneHandler(ctx: rlhubContext) {
    try {

        if (ctx.updateType === 'callback_query') {

            const data: string = ctx.update.callback_query.data

            if (data === 'back') {
                return await settingsChatGPTSectionRender(ctx)
            }

            ctx.answerCbQuery()

        }

    } catch (error) {
        console.error(error)
    }
}
async function changeModelSceneRender(ctx: rlhubContext) {
    try {

        let message: string = `<b>Укажите модель которую хотите использовать</b>`
        const user = await User.findOne({ id: ctx.from.id })

        message += `\nТекущая модель: ${user.gpt_model}`

        // ✅

        let models = [
            'gpt-3.5-turbo',
            'gpt-3.5-turbo-16k',
            'gpt-4',
            'gpt-4-0613'
        ]

        let extra: ExtraEditMessageText = {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    // [{ text: 'gpt-3.5-turbo', callback_data: 'use-model 3.5-turbo' }, { text: 'gpt-3.5-turbo-16k', callback_data: 'use-model 3.5-turbo16k' }],
                    // [{ text: 'gpt-4', callback_data: 'use-model 4' }, { text: 'gpt-4-0613', callback_data: 'use-model 4-0613' }],
                    // [{ text: 'Назад', callback_data: 'back' }]
                ]
            }
        }

        let row = []

        for (let i = 0; i < models.length; i++) {
            // extra

            const button = { text: `${models[i] === user.gpt_model ? '✅ ' + models[i] : models[i]}`, callback_data: `${models[i] === user.gpt_model ? 'skip' : 'use-model ' + models[i]} ${models[i]}` }

            row.push(button)

            if (row.length === 2) {
                extra.reply_markup.inline_keyboard.push(row)
                row = []
            }

        }

        if (row.length > 0) {
            extra.reply_markup.inline_keyboard.push(row)
        }

        extra.reply_markup.inline_keyboard.push([{ text: 'Назад', callback_data: 'back' }])

        ctx.updateType === 'callback_query' ? ctx.editMessageText(message, extra) : ctx.reply(message, extra)
        ctx.wizard.selectStep(9)

    } catch (error) {
        console.error(error)
    }
}

handler.on("message", async (ctx) => await greeting(ctx))

async function select_chat_handler(ctx: rlhubContext) {
    try {
        if (ctx.updateType === 'callback_query') {

            let data: string = ctx.update.callback_query.data

            if (data === 'back') {

                ctx.wizard.selectStep(0)
                await greeting(ctx)

            }

            if (data.split(" ")[1] === 'chat') {

                const user = await User.findOne({ id: ctx.from.id })
                console.log(user.chats)
                const chatHistory = await ChatModel.findById(user.chats[parseFloat(data.split(" ")[0])])
                console.log(chatHistory)
                ctx.scene.session.current_chat = chatHistory._id

                ctx.answerCbQuery("История чата загружена!")

                let message: string = `<b>Сохраненный диалог</b>\n\n`
                message += `Название диалога: <b>${chatHistory.name}</b>`
                const extra: ExtraEditMessageText = {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: 'Продолжить диалог', callback_data: 'continue' }],
                            [{ text: 'Выгрузить историю диалога', callback_data: 'save-dialog' }],
                            [{ text: 'Удалить диалог', callback_data: 'delete-dialog' }],
                            [{ text: 'Назад', callback_data: 'back' }],
                        ]
                    }
                }

                await ctx.editMessageText(message, extra).then(() => ctx.wizard.selectStep(5))
                // const chat = await ChatModel.findById(user.chats[parseFloat(data.split(" ")[1])])
                // console.log(chat)

            }

            ctx.answerCbQuery()

        }
    } catch (error) {
        console.error(error)
    }
}
async function onload_dialog_handler(ctx: rlhubContext) {
    try {

        if (ctx.updateType === 'callback_query') {

            const data: 'continue' | 'save-dialog' | 'delete-dialog' | 'back' = ctx.update.callback_query.data

            if (data === 'continue') {

            }

            if (data === 'back') {

                return await render_list_dialogs(ctx)

            }

            ctx.answerCbQuery()

        }

    } catch (error) {

        console.error(error)

    }
}
async function new_chat_handler(ctx: rlhubContext) {
    try {

        if (ctx.updateType === 'message') {

            if (ctx.update.message.text) {

                ctx.replyWithChatAction('typing');

                const message: string = ctx.update.message.text

                if (message === '/save') {
                    ctx.wizard.selectStep(4)
                    await ctx.reply('Отправьте название, которое хотите присвоить диалогу')
                    return console.log('Saving')
                }

            }

            return await sendRequest(ctx)
        }

    } catch (error) {

        console.log(error)

    }
}

async function saving_dialog(ctx: rlhubContext) {
    try {

        if (ctx.updateType === 'message') {

            if (ctx.update.message.text) {

                const ChatID: ObjectId = ctx.scene.session.current_chat
                await ChatModel.findByIdAndUpdate(ChatID, {
                    $set: {
                        name: ctx.update.message.text
                    }
                }).then(async () => {

                    await ctx.reply(`Ваш диалог сохранен под названием <b>${ctx.update.message.text}</b>`, { parse_mode: 'HTML' })
                    return await greeting(ctx)

                }).catch(async (error) => {

                    await ctx.reply('Возникла ошибка с базой данных')
                    console.error(error)

                })

            } else {

                await ctx.reply('Отправьте в виде текста')

            }

        }

    } catch (error) {

        console.error(error)

    }
}

export default chat