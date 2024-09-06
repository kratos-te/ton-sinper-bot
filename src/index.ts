import express, { Express, Request, Response } from 'express';
require("dotenv").config();
import http from 'http';
import axios from 'axios';
import { StonApiClient } from '@ston-fi/api';
import { DeDustClient } from '@dedust/sdk';
import { libNode } from '@tonclient/lib-node';
import { TonClient } from '@tonclient/core';
import { Server } from 'socket.io';
const TelegramBot = require("node-telegram-bot-api");


const stonfiClient = new StonApiClient();
const dedustClient = new DeDustClient({ endpointUrl: 'https://api.dedust.io' });

TonClient.useBinaryLibrary(libNode);
const client = new TonClient({
  network: {
    endpoints: ['https://toncenter.com/api/v2/jsonRPC'],
  },
});

const port = process.env.PORT || 3000;
let tokenAddress: string = '';
const app: Express = express();
const server = http.createServer(app);
const io = new Server(server);

const token = process.env.TELEGRAM_BOT_TOKEN;

let bot:any;
let userId:any;

io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

function snipeStonfi() {
  let temp = 0;
  let tempPoolData: any[] = [];
  setInterval(async () => {
    const response = await stonfiClient.getPools();
    const numberOfPools = response.length;
    if (temp === 0) {
      temp = numberOfPools;
      tempPoolData = response;
    }
    if (temp < numberOfPools) {
      console.log('New Pool Added to stonfi');
      console.log('Stonfi updated number of pools: ', numberOfPools);
      temp = numberOfPools;
      const diff: any = response.filter(
        (currentPool) =>
          !tempPoolData.some(
            (previousPool) => previousPool.address === currentPool.address,
          ),
      );
      console.log('Stonfi new Pools:', diff);
      io.emit('new-pool', diff);
      tempPoolData = response;
    } else {
      temp = numberOfPools;
      tempPoolData = response;
      console.log('Stonfi number of pools:', numberOfPools);
    }
  }, 1000);
}

// Regex pattern for basic TON address validation (e.g., base64 and starts with specific prefixes)
const tonAddressPattern = /^(EQ|Ef|kQ|kN|UQ|UN)[0-9A-Za-z_-]{46}$/;

// Function to validate if the input is a valid TON address
function isValidTonAddress(address:string) {
  return tonAddressPattern.test(address);
}


function initializeBot() {
  if (!bot) {
    bot = new TelegramBot(token, { polling: true });

    const start = (msg:any,  context:any)=> {
      const keyboard = {
        reply_markup: {
          keyboard: [
            [
              {
                text: "Input Address",
              },
            ],
          ],
          resize_keyboard: true,
          // one_time_keyboard: true,
        },
      };

      // telegram logo image url
      const url = "https://tele-mini-app-murex.vercel.app/_next/image?url=https%3A%2F%2Fframerusercontent.com%2Fimages%2FHr67yj6I3bDvBMruWOyGWjc8jPc.png&w=384&q=75";

      bot.sendPhoto(context.chatId || msg.chat.id, url, {
        caption:
          "Welcome to your Sniping Bot! 🐸\n\n" +
          "Please input token address you are looking for! 🕹\n",
        reply_markup: keyboard.reply_markup,
      });
    }

    bot.on("callback_query", (callbackQuery:any) => {
      const msg = callbackQuery.message;
      const chatId = msg.chat.id;
      userId = chatId;

      if (callbackQuery.data === "start_command") {
        start(msg, { chatId });
      }
    });

    bot.on('message', (msg:any) => {
      const chatId = msg.chat.id;
      const text = msg.text.trim();
    
      // Show main menu with input button when user sends /start
      if (text === '/start') {
        start(msg, { chatId });
      } 

      // Handle address input and validation
      else if (isValidTonAddress(text)) {
        bot.sendMessage(chatId, `✅ The address ${text} is a valid TON address.\n` + `Waiting for this token's launching ...`);
        tokenAddress = text;
        // Show main menu again after validation
        // showMainMenu(chatId);
      } 
      // If the message does not match the patterns above, show error or help message
      else {
        bot.sendMessage(chatId, `❌ The input is not a valid TON address. Please try again or use /start to see the options.`);
      }
    });
    
    bot.on("webhook_error", (error: any) => console.error("Webhook error:", error));

    console.log("Bot instance initialized successfully.");
  }
}


snipeStonfi();

function snipeDedust() {
  let temp = 0;
  let tempPoolData: any[] = [];
  setInterval(async () => {
    const response = await dedustClient.getPools();
    const numberOfPools = response.length;
    if (temp === 0) {
      temp = numberOfPools;
      tempPoolData = response;
    }
    if (temp < numberOfPools) {
      console.log('New Pool Added to dedust');
      console.log('Dedust updated number of pools: ', numberOfPools);
      temp = numberOfPools;
      const diff: any = response.filter(
        (currentPool) =>
          !tempPoolData.some(
            (previousPool) => previousPool.address === currentPool.address,
          ),
      );
      if(diff == tokenAddress) {
        bot.sendMessage(userId, "Your token has successfully launched!");
      }
      console.log('Dedust new Pools:', diff);
      io.emit('new-pool', diff);
      tempPoolData = response;
    } else {
      temp = numberOfPools;
      tempPoolData = response;
      console.log('Dedust number of pools:', numberOfPools);
    }
  }, 1000);
}

snipeDedust();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

async function decodeBoCData(bocData: string) {
  try {
    const decodedData = await client.boc.parse_message({ boc: bocData });
    return decodedData;
  } catch (error) {
    console.error('Error decoding BoC data:', error);
    return null;
  }
}

app.get('/mempool-stream', async (req, res) => {
  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const streamMempoolData = async () => {
      const response = await axios.get('https://tonapi.io/v2/sse/mempool', {
        headers: {
          Authorization:
            'Bearer AHC4IYTEMUOMVZYAAAACRCIPDXYY3OMJHLYG4G4KAFMYAY4YHGS5TGCXQJKWQEJA7HDESSY',
        },
        responseType: 'stream',
      });

      // response.data.pipe(res);
      response.data.on('data', async (chunk: any) => {
        try {
          const data = chunk.toString();
          const splits = data
            .split('\n')
            .map((item: string) => item.trim())
            .filter((item: string) => item);
          if (splits[0].includes('message')) {
            const _data = String(splits[2]);
            const bocData = _data.substring(14, _data.length - 2);
            const decodedData = await client.boc.parse_message({
              boc: bocData,
            });
            res.write(`data: ${JSON.stringify(decodedData)}\n\n`);
          }
          //   if (eventData.event === 'message') {
          //     const bocData = eventData.data.boc;
          //     const decodedData = await client.boc.parse_message({
          //       boc: bocData,
          //     });
          //     console.log('Decoded Data:', decodedData);
          //     res.write(`data: ${JSON.stringify(decodedData)}\n\n`); // Send decoded data as a response
          //   }
        } catch (error) {
          console.error('Error parsing or decoding data:', error);
        }
      });
      response.data.on('error', (error: any) => {
        console.error('SSE Error:', error);
        res.end();
      });
    };
    streamMempoolData();
  } catch (error: any) {
    console.error('Error: ', error);
    console.error('Error: ', error.response.data.error);
    res.status(500).json({ error: error.response.data.error });
  }
});

app.get('/decode', async (req, res) => {
  try {
    const { boc } = req.body;
    const decodedString = await decodeBoCData(boc);
    console.log(decodedString);
    res.json({ result: decodedString });
  } catch (error: any) {
    console.error('Error: ', error);
    res.status(500).json({ error: error });
  }
});

app.get('/pools', async (req: Request, res: Response) => {
  const response = await stonfiClient.getPools();
  console.log('Number of pools: ', response.length);
  res.json(response);
});

app.get('/assets', async (req: Request, res: Response) => {
  const assets = await stonfiClient.getAssets();
  console.log('Number of assets: ', assets.length);
  res.json(assets);
});

app.get('/wallet-assets', async (req: Request, res: Response) => {
  const walletAssets = await stonfiClient.getWalletAssets(
    'UQDJNqhcUuLKTHYbX5kmeE1X4IixRPBZjl6nlqlDhOZ3s4Yi',
  );
  console.log('Number of wallet assets: ', walletAssets.length);
  res.json(walletAssets);
});

if (process.env.NODE_ENV === "production") {
  app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
    initializeBot();
  });
} else {
  console.log("Bot is running in development mode.");
  initializeBot();
}