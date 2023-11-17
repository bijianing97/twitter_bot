import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import { logger } from "./logger";
import { Client, TextChannel, GatewayIntentBits } from "discord.js";

import {
  followingOptionsWithCountList,
  OptionsWithCount,
  twitterNames,
  twitterNamesToRealNames,
} from "./options";

const filePath = path.join(__dirname, "data.json");

const callInterval = 0.5 * 24 * 60 * 60 * 1000;

type followingDataType = {
  user_id: string;
  screen_name: string;
  description: string;
  profile_image: string;
  statuses_count: number;
  followers_count: number;
  friends_count: number;
  media_count: number;
  name: string;
};

type dataType = {
  lastReset: number;
  lastPull: number;
  followingOptionsWithCountList: OptionsWithCount[];
  accoutToFollowingData: {
    account: string;
    following: followingDataType[];
  }[];
};

type sendFollowingDataType = {
  name: string;
  screen_name: string;
  link: string;
  description: string;
};

// 保存对象到文件
function saveDataToFile(data: dataType): void {
  try {
    const dataJson = JSON.stringify(data);
    fs.writeFileSync(filePath, dataJson, "utf8");
    console.log("Data saved to file.");
  } catch (err) {
    console.error("Error writing to file:", err);
  }
}

// 从文件读取数组
function loadDataFromFile() {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf8");
      if (data === "") {
        return undefined;
      }
      return JSON.parse(data) as dataType;
    }
    return undefined;
  } catch (err) {
    console.error("Error reading from file:", err);
    return undefined;
  }
}

function findMinCountOptions(
  optionsWithCountList: OptionsWithCount[]
): OptionsWithCount {
  let minCount = optionsWithCountList[0].count;
  let minCountIndex = 0;
  for (let i = 1; i < optionsWithCountList.length; i++) {
    if (optionsWithCountList[i].count < minCount) {
      minCount = optionsWithCountList[i].count;
      minCountIndex = i;
    }
  }
  return optionsWithCountList[minCountIndex];
}

function resetCount(optionsWithCountList: OptionsWithCount[]): void {
  optionsWithCountList.forEach((obj) => {
    obj.count = 0;
  });
}

async function getFollowingNames(
  screenname: string,
  followingOptionsWithCountListNow: OptionsWithCount[],
  interruptCursor: string,
  interruptFollowingResults: followingDataType[]
): Promise<followingDataType[]> {
  logger.info(`start function  ${screenname}.`);
  let followingResults: followingDataType[] = interruptFollowingResults;
  let nextCursor = interruptCursor;
  try {
    while (nextCursor != undefined) {
      const obj = findMinCountOptions(followingOptionsWithCountListNow);
      const newOptions = { ...obj.options };
      newOptions.params.screenname = screenname;
      newOptions.params.cursor = nextCursor;
      const response = await axios.request(newOptions);
      obj.count++;
      const data = response.data;
      followingResults = followingResults.concat(data.following);
      logger.info(`followingResults.length:${followingResults.length}`);
      nextCursor = data.next_cursor;
      let judge = 0;
      while (nextCursor === undefined) {
        if (judge > 2) {
          console.log("Judge over");
          break;
        }
        console.log(`Judge start ${judge + 1}`);
        const judgeObj = findMinCountOptions(followingOptionsWithCountListNow);
        const judeOptions = { ...judgeObj.options };
        judeOptions.params.screenname = screenname;
        judeOptions.params.cursor = newOptions.params.cursor;
        const judgeResponse = await axios.request(judeOptions);
        const judgeData = judgeResponse.data;
        judgeObj.count++;
        judge++;
        nextCursor = judgeData.next_cursor;
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    return followingResults;
  } catch (e) {
    console.log(e);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    return await getFollowingNames(
      screenname,
      followingOptionsWithCountListNow,
      nextCursor,
      followingResults
    );
  }
}

(async () => {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  });
  await client.login(process.env.bot_token);
  const channelId = process.env.channel_id as string;
  let channel: TextChannel | undefined = undefined;
  while (channel == undefined) {
    channel = client.channels.cache.get(channelId) as TextChannel;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  const existedData = loadDataFromFile();

  let lastPull = 0;
  let lastReset = new Date().getMonth();
  let followingOptionsWithCountListNow = followingOptionsWithCountList;
  if (existedData) {
    followingOptionsWithCountListNow =
      existedData.followingOptionsWithCountList;
    lastReset = existedData.lastReset;
    lastPull = existedData.lastPull;
  }
  logger.info(`Start twitter bot.`);
  setInterval(async () => {
    if (Date.now() - lastPull > callInterval) {
      const nowMonth = new Date().getMonth();
      if (nowMonth != lastReset) {
        logger.info(
          `Start reset count,time is ${new Date().toLocaleTimeString()}.`
        );
        resetCount(followingOptionsWithCountListNow);
        lastReset = nowMonth;
        logger.info(
          `End reset count,time is ${new Date().toLocaleTimeString()}.`
        );
      }
      logger.info(
        `Start pull data,time is ${new Date().toLocaleTimeString()}.`
      );
      const newData: dataType = {
        followingOptionsWithCountList: followingOptionsWithCountListNow,
        lastReset: lastReset,
        lastPull: lastPull,
        accoutToFollowingData: [],
      };
      const newFollowing = new Map<string, sendFollowingDataType[]>();
      for (let i = 0; i < twitterNames.length; i++) {
        logger.info(`Start get following names of ${twitterNames[i]}.`);
        const followingResults = await getFollowingNames(
          twitterNames[i],
          followingOptionsWithCountListNow,
          "",
          []
        );
        console.log(followingResults.length);
        if (existedData) {
          const oldFollowingResults = existedData.accoutToFollowingData.find(
            (obj) => obj.account === twitterNames[i]
          )?.following;
          const newFollowings = followingResults.filter(
            (objNew) =>
              !oldFollowingResults?.find(
                (onjOld) => onjOld.user_id === objNew.user_id
              )
          );
          const newFollowingData: sendFollowingDataType[] = newFollowings.map(
            (obj) => {
              return {
                name: obj.name,
                screen_name: obj.screen_name,
                link: `https://twitter.com/${obj.screen_name}`,
                description: obj.description,
              };
            }
          );
          if (newFollowingData.length > 0) {
            newFollowing.set(twitterNames[i], newFollowingData);
          }
        }
        newData.accoutToFollowingData.push({
          account: twitterNames[i],
          following: followingResults,
        });
      }
      // discord todo
      if (newFollowing.size > 0) {
        logger.info(`New following:${newFollowing}`);
        newFollowing.forEach((value, key) => {
          channel!.send(
            `## ${twitterNamesToRealNames[key]}的新关注:\n
          ${value
            .map(
              (obj) =>
                `> * ${obj.name} \n > * ${obj.link} \n > * ${obj.description} \n`
            )
            .join("\n")}`
          );
        });
      } else {
        logger.info(`No new following.`);
        channel!.send(`## 过去24小时没有新关注`);
      }

      lastPull = Date.now();
      newData.lastPull = lastPull;
      lastReset = new Date().getMonth();
      newData.lastReset = lastReset;
      newData.followingOptionsWithCountList = followingOptionsWithCountListNow;
      saveDataToFile(newData);
      logger.info(`End pull data,time is ${new Date().toLocaleTimeString()}.`);
    } else {
      logger.info("Not time, no need to pull data.");
    }
  }, 30 * 60 * 1000);
  await client.destroy();
})();
