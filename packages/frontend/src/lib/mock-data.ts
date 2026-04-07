import { Application, Bounty, Dispute } from "./types";

export const MOCK_BOUNTIES: Bounty[] = [
  {
    id: 1,
    title: "Minecraft death counter overlay for Neuro-sama",
    description:
      "Build a real-time overlay that tracks Neuro-sama's deaths in Minecraft and displays them on stream. Should integrate with OBS via browser source. Must support custom styling and animations for each death event. Bonus if it can distinguish death causes (creeper, fall, lava, etc.).",
    category: "Game Integration",
    reward: "1,500",
    status: "Open",
    sponsor: "0xAlice...1234",
    dev: null,
    deadline: "30 days",
    reviewDeadline: null,
    deliverableURI: null,
    createdAt: "2026-03-28",
  },
  {
    id: 2,
    title: "Osu! beatmap request system via channel points",
    description:
      "Create a system where Twitch viewers can use channel points to request specific Osu! beatmaps for Neuro-sama to play. Needs a queue management UI, difficulty filters, and auto-rejection of maps above a certain star rating. Should integrate with Osu! API v2 and Twitch EventSub.",
    category: "Game Integration",
    reward: "2,000",
    status: "Active",
    sponsor: "0xBob...5678",
    dev: "0xShinji...abcd",
    deadline: "22 days",
    reviewDeadline: null,
    deliverableURI: null,
    createdAt: "2026-03-20",
  },
  {
    id: 3,
    title: "Custom emote set — Neuro expressions pack",
    description:
      "Design a set of 12 custom emotes capturing Neuro-sama's signature expressions. Must include: happy, confused, angry, smug, crying, surprised, sleeping, thinking, love, scared, disappointed, and excited. Format: 112x112, 56x56, 28x28 PNG with transparent backgrounds. Style should match existing channel art.",
    category: "Art",
    reward: "800",
    status: "Open",
    sponsor: "0xCarol...9abc",
    dev: null,
    deadline: "14 days",
    reviewDeadline: null,
    deliverableURI: null,
    createdAt: "2026-04-01",
  },
  {
    id: 4,
    title: "Discord bot for tracking bounty status",
    description:
      "Build a Discord bot that posts updates to a designated channel whenever a bounty changes status. Should support slash commands to list open bounties, check specific bounty details, and subscribe to notifications. Must read from on-chain events.",
    category: "Tool",
    reward: "600",
    status: "Submitted",
    sponsor: "0xDave...def0",
    dev: "0xEve...4567",
    deadline: "5 days",
    reviewDeadline: "12 days",
    deliverableURI: "https://github.com/example/neuro-bounty-bot",
    createdAt: "2026-03-15",
  },
];

export const MOCK_APPLICATIONS: Record<number, Application[]> = {
  1: [
    {
      address: "0xDev1...aaaa",
      message:
        "I've built several OBS overlays before, including a kill counter for Valorant streams. Can deliver in 2 weeks.",
      appliedAt: "2026-03-30",
    },
    {
      address: "0xDev2...bbbb",
      message:
        "Full-stack dev with Minecraft modding experience. Happy to start immediately.",
      appliedAt: "2026-04-01",
    },
  ],
  3: [
    {
      address: "0xArtist...cccc",
      message:
        "Professional emote artist with 200+ emotes on BTTV/FFZ. Portfolio: example.com/portfolio",
      appliedAt: "2026-04-03",
    },
  ],
};

export const MOCK_DISPUTE: Dispute = {
  bountyId: 99,
  approveCount: 7,
  rejectCount: 2,
  quorum: 10,
  deadline: "2026-04-20",
  extended: false,
  resolved: false,
};
