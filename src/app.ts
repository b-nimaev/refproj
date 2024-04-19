import express from 'express';
import bodyParser from 'body-parser';
import { IUser, User } from './models/IUser';
import { IPayment, Payment } from './models/IPayment';
import { ObjectId } from 'mongodb';
import { bot } from './index';
import cors from 'cors';
const morgan = require("morgan")
const PORT = process.env.PORT;
import https from 'https'; 
import fs from 'fs';
import axios from 'axios';
import dotenv from 'dotenv';
import { idText } from 'typescript';
import rlhubContext from './bot/models/rlhubContext';
import { greeting } from './bot/views/home.scene';

dotenv.config()

const app = express();

export const secretPath = `/telegraf/burlang`;

app.use(bodyParser.json());
app.use((req, res, next) => {
    console.log(req.path)
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    next();
});

app.post(`/telegraf/burlang`, (req, res) => {
    bot.handleUpdate(req.body, res);
});

app.get("/", (req, res) => res.send("Бот запущен!"))

app.use(morgan("dev"));
app.use(express.json())
// app.use(cors(corsOptions));

app.listen(PORT, () => { console.log(`Server running on port ${PORT}`) });

const fetchData = async () => {
    const { default: fetch } = await import('node-fetch');

    const res = await fetch('http://127.0.0.1:4040/api/tunnels')
    //@ts-ignore
    // console.log(await res.json().tu)
    const json = await res.json();
    // console.log(json)
    //@ts-ignore
    const secureTunnel = json.tunnels[0].public_url
    console.log(secureTunnel)
    await bot.telegram.setWebhook(`${secureTunnel}${secretPath}`)
        .then(res => {
            console.log(res)
        })
};

async function set_webhook() {
    console.log(`${process.env.mode?.replace(/"/g, '')}`)
    if (`${process.env.mode?.replace(/"/g, '')}` === "production") {
        console.log(`${process.env.mode?.replace(/"/g, '')}`)
        console.log(`prod secret path: ${secretPath}`)
        await bot.telegram.setWebhook(`https://drvcash.com/telegraf/burlang`)
            .then((status) => {
                console.log(secretPath);
                console.log(status);
            }).catch(err => {
                console.log(err)
            })
    } else {
        await fetchData().catch((error: any) => {
            console.error('Error setting webhook:', error);
        });
    }
};



(async function () {
    try {
        await set_webhook()
        // await sendRequest('голова болит').then(res => { console.log(res.data.choices[0].message.content) })
    } catch (error) {
        console.log(error)
    }
})();