import * as dotenv from "dotenv";
dotenv.config();

export type Options = {
  method: string;
  url: string;
  params: {
    screenname: string;
    cursor: string;
  };
  headers: {
    "X-RapidAPI-Key": string;
    "X-RapidAPI-Host": string;
  };
};

export type OptionsWithCount = {
  options: Options;
  count: number;
};

export const followingOptionsWithCountList: OptionsWithCount[] = [];

export const twitterNames = process.env.twitterNames!.split(",");
const realNames = process.env.realNames!.split(",");
export const twitterNamesToRealNames: { [key: string]: string } = {};
for (let i = 0; i < twitterNames.length; i++) {
  twitterNamesToRealNames[twitterNames[i]] = realNames[i];
}
const apiKeys = process.env.apiKeys!.split(",");

for (let i = 0; i < apiKeys.length; i++) {
  const newOptions: Options = {
    method: "GET",
    url: "https://twitter-api45.p.rapidapi.com/following.php",
    params: {
      screenname: "",
      cursor: "",
    },
    headers: {
      "X-RapidAPI-Key": apiKeys[i],
      "X-RapidAPI-Host": "twitter-api45.p.rapidapi.com",
    },
  };
  followingOptionsWithCountList.push({ options: newOptions, count: 0 });
}
