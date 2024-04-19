import { Composer, Scenes } from "telegraf";
import { ExtraEditMessageText } from "telegraf/typings/telegram-types";
import { ISentence, Sentence } from "../../models/ISentence";
import { IUser, User } from "../../models/IUser";
import rlhubContext from "../models/rlhubContext";
import {
  InlineKeyboardButton,
  InlineKeyboardMarkup,
  ReplyKeyboardMarkup,
} from "telegraf/typings/core/types/typegram";
import { getWalletInfo, getWallets } from "../../ton-connect/wallets";
import TonConnect from "@tonconnect/sdk";
import { TonConnectStorage } from "../../ton-connect/storage";
import { getConnector } from "../../ton-connect/connector";
import QRCode from "qrcode";

const baseKeyboard = {
  keyboard: [
    ["О клубе", "Реферальная ссылка"],
    ["Донаты", "Настройки"],
  ],
  resize_keyboard: true, // Делает клавиатуру меньше, если включено
  one_time_keyboard: true, // Скрывает клавиатуру после использования
};

const channelSubscribe = {
  keyboard: [["Я подписался"]],
  resize_keyboard: true, // Делает клавиатуру меньше, если включено
  one_time_keyboard: true, // Скрывает клавиатуру после использования
};

const handler = new Composer<rlhubContext>();
const home = new Scenes.WizardScene(
  "home",
  handler,
  async (ctx: rlhubContext) => await registratonHandler(ctx),
  async (ctx: rlhubContext) => await menuHandler(ctx),
  async (ctx: rlhubContext) => await walletHandler(ctx)
);

export async function greeting(ctx: rlhubContext, reply?: boolean) {
  const refId = ctx.scene.session.ref_id;
  const refUser = await User.findOne({ id: refId });

  if (!refUser) {
    return ctx.reply(`Ссылка не действительна!`);
  }

  let message = `Вы регистрируетесь по рекомендации`;
  if (typeof refUser.first_name === "string") {
    message += " " + refUser.first_name;
  }
  if (typeof refUser.last_name === "string") {
    message += " " + refUser.last_name;
  }
  if (typeof refUser.username === "string") {
    message += " — " + refUser.username;
  }
  message += ". Продолжить регистрацию?";

  const extra: any = {
    parse_mode: "HTML",
    reply_markup: {
      keyboard: [["Да", "Нет"]],
      resize_keyboard: true, // Делает клавиатуру меньше, если включено
      one_time_keyboard: true, // Скрывает клавиатуру после использования
    },
  };

  ctx.wizard.selectStep(1)
  
  try {
    ctx.reply(message, extra);

  } catch (err) {
    console.log(err);
  }
}

home.start(async (ctx: rlhubContext) => {
  let ref_user: number = 0;

  // await new User({
  //   first_name: ctx.from.first_name,
  //   last_name: ctx.from.last_name,
  //   username: ctx.from.username,
  //   id: ctx.from.id
  // }).save()

  if (ctx.startPayload) {
    ref_user = parseFloat(ctx.startPayload);
    console.log(ref_user);
    ctx.scene.session.ref_id = ref_user;
  }

  try {
    const document: IUser | null = await User.findOne({ id: ctx.from?.id });
    await greeting(ctx);
    // if (!document) {
    //   await greeting(ctx);
    // } else {
    //   const photoUrl =
    //     "https://letsenhance.io/static/8f5e523ee6b2479e26ecc91b9c25261e/1015f/MainAfter.jpg";
    //   const caption =
    //     "Здесь ваш текст, который будет показан в подписи к фото.";
    //   await ctx.replyWithPhoto(photoUrl, { caption: caption });
    //   await ctx.reply("Вы уже зарегистрированы!", {
    //     parse_mode: "Markdown", // Или 'HTML', если вы хотите форматировать текст
    //     reply_markup: baseKeyboard,
    //   });
    // }
  } catch (err) {
    console.log(err);
  }
});

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

home.enter(async (ctx) => {
  return await greeting(ctx);
});

async function registratonHandler(ctx: rlhubContext) {
  if (ctx.from) {
    try {
      console.log("123");
      if (ctx.updateType === "message") {
        if (ctx.update.message.text) {
          let text: string = ctx.update.message.text;
          const message = `Для продолжения работы, подпишитесь на канал нашего сообщества. https://t.me/bur_live`;
          ctx.reply(message, { reply_markup: channelSubscribe });

          if (ctx.update.message.text === "Я подписался") {
            const status = await checkSubscription(ctx);
            if (status) {
              await User.findOneAndUpdate(
                { id: ctx.from.id },
                {
                  $set: {
                    sponsor: ctx.scene.session.ref_id,
                  },
                }
              );
              const subMessage = `Позравляю, вы пописаны канал!`;
              ctx.reply(subMessage, { reply_markup: baseKeyboard });
              ctx.wizard.next();
            }
          }
        } else {
          await ctx.reply("Нужно отправить в текстовом виде");
        }
      }
    } catch (err) {
      ctx.wizard.selectStep(0);
      await greeting(ctx);
    }
  }
}
async function menuHandler(ctx: rlhubContext) {
  if (ctx.from) {
    const user: IUser = await User.findOne({ id: ctx.from.id });
    let sponsor = null;
    if (!user) {
      return false;
    }

    if (user.sponsor) {
      sponsor = await User.findOne({ id: user.sponsor });
    }

    try {
      if (ctx.updateType === "message") {
        if (ctx.update.message.text) {
          let text: "О клубе" | "Донаты" | "Реферальная ссылка" | "Настройки" =
            ctx.update.message.text;

          // О клубе

          if (text === "О клубе") {
            const photoUrl =
              "https://letsenhance.io/static/8f5e523ee6b2479e26ecc91b9c25261e/1015f/MainAfter.jpg";
            const caption =
              "Здесь ваш текст, который будет показан в подписи к фото.";
            ctx.replyWithPhoto(photoUrl, {
              caption: caption,
              parse_mode: "Markdown", // Или 'HTML', если вы хотите форматировать текст
              reply_markup: baseKeyboard,
            });
          }

          // Донаты

          if (text === "Донаты") {
            let message: string = `Ваш спонсор: <b>${sponsor.username}</b> \nМой статус: <b>Free</b>\nЛично приглашенных: <b>5132</b>\nПолуно донатов: <b>123 Ton</b>`;
            const extra: ExtraEditMessageText = {
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "🟥 Стартовый - 1000 🟥",
                      callback_data: "start-1000",
                    },
                  ],
                  [
                    {
                      text: "🟥 Бронза - 1000 🟥",
                      callback_data: "start-3000",
                    },
                  ],
                  [
                    {
                      text: "🟥 Серебро - 9000 🟥",
                      callback_data: "start-9000",
                    },
                  ],
                  [
                    {
                      text: "🟥 Золото - 30000 🟥",
                      callback_data: "start-30000",
                    },
                  ],
                  [
                    {
                      text: "🟥 Платина - 90000 🟥",
                      callback_data: "start-90000",
                    },
                  ],
                ],
              },
            };

            ctx.reply(message, extra);
          }

          if (text === "Реферальная ссылка") {
            if (user.wallet) {
              const reflink = "https://t.me/xpremium1bot?start=" + ctx.from.id;
              const message = `Вот ваша рефаральная ссылка: ${reflink}`;
              await ctx.reply(message, { reply_markup: baseKeyboard });
            } else {
              const message =
                "Для получения реферальной ссылки, вы должны активировать тариф минимум на 1000 Руб, и указать кошелек Ton";
              await ctx.reply(message, { reply_markup: baseKeyboard });
            }
          }

          if (text === "Настройки") {
            if (user.wallet) {
              const message = `Вот ваш кошелек Ton: ${user.wallet} \n\n/change — Изменить`;
              await ctx.reply(message, { reply_markup: baseKeyboard });
            } else {
              const message =
                "У вас нет привязанного кошелька, для добавления отправьте коману /add";
              await ctx.reply(message, { reply_markup: baseKeyboard });
            }

            ctx.wizard.next();
          }
        } else {
          await ctx.reply("Нужно отправить в текстовом виде");
        }
      } else if (ctx.updateType === "callback_query") {
        ctx.answerCbQuery();
        ctx.reply(
          "Для активации площадки отправьте 2.87 TON на кошелек в течение 30 минут, <code>UQCbaw4zpUguHg71bZJfEWzqsnxNiHn226a9-ne-9sXSl4g7</code>"
        );
      }
    } catch (err) {
      ctx.wizard.selectStep(0);
      await greeting(ctx);
    }
  }
}

async function walletHandler(ctx: rlhubContext) {
  try {
    const user: IUser = await User.findOne({ id: ctx.from.id });
    if (ctx.updateType === "message") {
      if (ctx.update.message.text) {
        let text: string = ctx.update.message.text;

        if (
          ctx.update.message.text === "/add" ||
          ctx.update.message.text === "/add"
        ) {
          return await connectWallet(ctx);
        } else if (
          "Настройки" ||
          "О клубе" ||
          "Донаты" ||
          "Реферальная ссылка"
        ) {
          await menuHandler(ctx);
          return ctx.wizard.selectStep(2);
        } else {
          await ctx.reply(
            `Вы хотите установить ${ctx.update.message.text} вашим кошельком?`,
            {
              parse_mode: "HTML",
              reply_markup: {
                keyboard: [["Да", "Нет"]],
                resize_keyboard: true, // Делает клавиатуру меньше, если включено
                one_time_keyboard: true, // Скрывает клавиатуру после использования
              },
            }
          );
        }
      } else {
        await ctx.reply("Нужно отправить в текстовом виде");
      }
    }
  } catch (error) {
    ctx.wizard.selectStep(0);
    await greeting(ctx);
  }
}

// Функция для проверки подписки пользователя
async function checkSubscription(ctx) {
  const channelId = -1001658597277; // Замените на имя пользователя вашего канала
  const userId = ctx.from.id; // ID пользователя, который использует бота

  try {
    const memberStatus = await ctx.telegram.getChatMember(channelId, userId);
    // Проверяем, подписан ли пользователь
    if (
      memberStatus.status === "member" ||
      memberStatus.status === "administrator" ||
      memberStatus.status === "creator"
    ) {
      return true; // Пользователь подписан
    } else {
      return false; // Пользователь не подписан
    }
  } catch (error) {
    console.error("Ошибка при проверке статуса пользователя:", error);
    return false; // В случае ошибки или если пользователь не найден
  }
}

async function connectWallet(ctx: rlhubContext) {
  try {
    const chatId = ctx.from.id;
    const wallets = await getWallets();

    const connector = getConnector(chatId);

    connector.onStatusChange(async (wallet) => {
      if (wallet) {
        const walletName =
          (await getWalletInfo(wallet.device.appName))?.name ||
          wallet.device.appName;
        ctx.reply(`${walletName} wallet connected!`);
      }
    });

    const link = connector.connect(wallets);
    const image = await QRCode.toBuffer(link);

    const buffer = Buffer.from(image);
    await ctx.replyWithPhoto(
      { source: buffer },
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Выбрать кошелек",
                callback_data: JSON.stringify({ method: "chose_wallet" }),
              },
            ],
          ],
        },
      }
    );
    ctx.wizard.selectStep(2);
  } catch (error) {
    console.log(error);
  }
}
export default home;
