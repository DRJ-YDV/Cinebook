export type Movie = {
  id: string;
  /** External TMDB reference. Present on TMDB-sourced movies only. */
  tmdbId?: number;
  title: string;
  poster: string;
  backdrop: string;
  description: string;
  genre: string[];
  language: string[];
  duration: number; // minutes
  rating: number;
  certification: string;
  releaseDate: string; // ISO
  cast: string[];
  director: string;
  trailer: string;
  status: "now-showing" | "coming-soon";
  popularity: number;
  formats: Format[];
};

export type Format = "2D" | "3D" | "IMAX" | "4DX";

export type Theatre = {
  id: string;
  name: string;
  city: string;
  address: string;
  rating: number;
  distanceKm: number;
  screens: { id: string; name: string; seats: number }[];
  formats: Format[];
};

export const CITIES = [
  "Gwalior",
  "Delhi",
  "Mumbai",
  "Bangalore",
  "Hyderabad",
  "Pune",
  "Jaipur",
  "Indore",
  "Bhopal",
];

const P = (n: number) => `/images/poster-${n}.jpg`;
const B = (n: number) => `/images/backdrop-${n}.jpg`;

type Seed = [
  title: string,
  genre: string[],
  language: string[],
  duration: number,
  rating: number,
  cert: string,
  release: string,
  director: string,
  cast: string[],
  desc: string,
  status: Movie["status"],
];

const seeds: Seed[] = [
  [
    "Neon Requiem",
    ["Action", "Sci-Fi"],
    ["English", "Hindi"],
    148,
    8.7,
    "UA",
    "2026-08-07",
    "Ira Menon",
    ["Kabir Rao", "Naomi Sethi", "Dev Arora"],
    "A rogue courier discovers the city's memory grid is being rewritten every midnight, and only she remembers the world that came before.",
    "now-showing",
  ],
  [
    "The Last Monsoon",
    ["Drama", "Romance"],
    ["Hindi"],
    132,
    8.2,
    "U",
    "2026-07-24",
    "Ananya Bhat",
    ["Rhea Kapoor", "Aman Joshi", "Ila Nair"],
    "Two strangers stranded by a record monsoon spend seventy-two hours rewriting what they thought they wanted from life.",
    "now-showing",
  ],
  [
    "Ironpeak",
    ["Action", "Thriller"],
    ["English", "Tamil"],
    141,
    7.9,
    "UA",
    "2026-08-01",
    "Marcus Vale",
    ["Ryan Cole", "Sana Qureshi", "Leo Park"],
    "A disgraced mountaineer leads a rescue up a peak that has never given anyone back.",
    "now-showing",
  ],
  [
    "Paper Lanterns",
    ["Animation", "Family"],
    ["English", "Hindi", "Telugu"],
    104,
    8.5,
    "U",
    "2026-07-18",
    "Yuki Tanabe",
    ["Mira Sen", "Toby Wren", "Anu Raj"],
    "A shy girl folds paper lanterns that carry her wishes to a city floating above the clouds.",
    "now-showing",
  ],
  [
    "Blackline",
    ["Crime", "Thriller"],
    ["English"],
    127,
    7.6,
    "A",
    "2026-08-08",
    "Dara Fields",
    ["Owen Bright", "Priya Malhotra", "Sam Ito"],
    "A metro detective follows a string of impossible robberies down into the tunnels beneath the city.",
    "now-showing",
  ],
  [
    "Sunfall Circus",
    ["Fantasy", "Adventure"],
    ["English", "Hindi"],
    136,
    8.0,
    "UA",
    "2026-07-31",
    "Elena Ruiz",
    ["Isha Verma", "Nico Farr", "Bela Krishnan"],
    "When the sun refuses to set, a travelling circus becomes the last place where night can be bought by the hour.",
    "now-showing",
  ],
  [
    "Kaya",
    ["Drama"],
    ["Marathi", "Hindi"],
    118,
    8.4,
    "UA",
    "2026-07-10",
    "Sameer Deshpande",
    ["Kaveri Pawar", "Ravi Shinde", "Mala Rane"],
    "A village potter's daughter takes her father's unfinished commission to the city and finds herself remaking more than clay.",
    "now-showing",
  ],
  [
    "Orbital Nine",
    ["Sci-Fi", "Thriller"],
    ["English"],
    152,
    8.1,
    "UA",
    "2026-08-14",
    "Hana Lindqvist",
    ["Cole Mensah", "Riya Dutt", "Anders Vik"],
    "The crew of a decommissioned station receives a distress call in their own voices.",
    "now-showing",
  ],
  [
    "Chilli Oil",
    ["Comedy"],
    ["Hindi", "Punjabi"],
    112,
    7.4,
    "UA",
    "2026-07-26",
    "Gagan Sidhu",
    ["Manav Bedi", "Tanya Grewal", "Pinky Ahuja"],
    "Two rival food-truck families accidentally cater the same wedding, with the same secret recipe.",
    "now-showing",
  ],
  [
    "Hollow Tide",
    ["Horror", "Mystery"],
    ["English", "Malayalam"],
    108,
    7.2,
    "A",
    "2026-08-02",
    "Reena Thomas",
    ["Alia Fernandes", "Jude Mathew", "Karan Pillai"],
    "A coastal town's lighthouse starts signalling in a code nobody living has used for a hundred years.",
    "now-showing",
  ],
  [
    "Twelve Yards",
    ["Sports", "Drama"],
    ["Hindi", "English"],
    139,
    8.3,
    "U",
    "2026-07-04",
    "Vikram Salvi",
    ["Arjun Tomar", "Neel Bose", "Simran Kaur"],
    "A washed-up goalkeeper coaches a girls' team in a town that has never had one.",
    "now-showing",
  ],
  [
    "The Cartographer",
    ["Mystery", "Drama"],
    ["English"],
    124,
    7.8,
    "UA",
    "2026-08-09",
    "Julien Marchand",
    ["Theo Blanc", "Amara Osei", "Ines Roy"],
    "A mapmaker realises every street he invents as a copyright trap has started to exist.",
    "now-showing",
  ],
  [
    "Velocity Rani",
    ["Action", "Comedy"],
    ["Hindi", "Tamil", "Telugu"],
    145,
    7.7,
    "UA",
    "2026-09-11",
    "Deepa Iyer",
    ["Rani Shetty", "Vikas Nambiar", "Zoya Khan"],
    "India's fastest getaway driver takes one last job — chauffeuring her own mother across three states.",
    "coming-soon",
  ],
  [
    "Glass Harvest",
    ["Sci-Fi", "Drama"],
    ["English"],
    131,
    0,
    "UA",
    "2026-09-25",
    "Noor Aziz",
    ["Elif Demir", "Jonas Wire", "Padma Rao"],
    "In a desert where rain is manufactured, a farmer sues the sky.",
    "coming-soon",
  ],
  [
    "Midnight Mithai",
    ["Romance", "Comedy"],
    ["Hindi"],
    121,
    0,
    "U",
    "2026-10-02",
    "Farah Qadri",
    ["Aditi Sood", "Rehan Mirza", "Jaya Prakash"],
    "A night-shift sweet shop becomes the unlikely confessional for a neighbourhood in love.",
    "coming-soon",
  ],
  [
    "Warden of Bones",
    ["Fantasy", "Action"],
    ["English", "Hindi"],
    158,
    0,
    "A",
    "2026-10-16",
    "Grigor Petrov",
    ["Sasha Ivanova", "Bram Kohl", "Nadia Rehman"],
    "The last keeper of a buried empire wakes to find her tomb has become a border town.",
    "coming-soon",
  ],
  [
    "Signal Hill",
    ["Thriller"],
    ["English", "Kannada"],
    117,
    0,
    "UA",
    "2026-11-06",
    "Meera Rao",
    ["Nikhil Gowda", "Trisha Menon", "Ahmed Zaki"],
    "A radio astronomer hears a countdown hidden inside cosmic background noise.",
    "coming-soon",
  ],
  [
    "Little Empires",
    ["Drama", "Family"],
    ["Bengali", "Hindi"],
    126,
    0,
    "U",
    "2026-11-20",
    "Sourav Ghosh",
    ["Rina Dasgupta", "Abir Sen", "Mohit Bhandari"],
    "Three siblings inherit a crumbling cinema hall and one impossible condition.",
    "coming-soon",
  ],
];

const allFormats: Format[][] = [
  ["2D", "3D", "IMAX"],
  ["2D"],
  ["2D", "IMAX", "4DX"],
  ["2D", "3D"],
  ["2D", "3D", "IMAX", "4DX"],
];

export const MOVIES: Movie[] = seeds.map((s, i) => ({
  id: `m${i + 1}`,
  title: s[0],
  poster: P((i % 6) + 1),
  backdrop: B((i % 3) + 1),
  genre: s[1],
  language: s[2],
  duration: s[3],
  rating: s[4],
  certification: s[5],
  releaseDate: s[6],
  director: s[7],
  cast: s[8],
  description: s[9],
  status: s[10],
  trailer: "https://www.youtube.com/embed/aqz-KE-bpKQ",
  popularity: 100 - i * 3 + ((i * 7) % 11),
  formats: allFormats[i % allFormats.length]!,
}));

const theatreSeeds: [name: string, city: string, address: string, rating: number, dist: number][] =
  [
    ["Aurora Cineplex", "Gwalior", "Gwalior Central Mall, City Centre", 4.5, 2.1],
    ["Starlight Grand", "Gwalior", "DB City Road, Thatipur", 4.3, 4.6],
    ["Prism 7 Screens", "Delhi", "Connaught Place, Block A", 4.6, 3.2],
    ["Metro Lumiere", "Delhi", "Saket District Centre", 4.2, 6.8],
    ["Marine Reel", "Mumbai", "Marine Lines, Queens Road", 4.7, 1.9],
    ["Bandra Bijou", "Mumbai", "Linking Road, Bandra West", 4.4, 5.4],
    ["Indiranagar Picturehouse", "Bangalore", "100 Feet Road, Indiranagar", 4.5, 2.7],
    ["Charminar Cinemas", "Hyderabad", "Banjara Hills, Road No 12", 4.1, 7.3],
    ["Deccan Reelworks", "Pune", "FC Road, Shivajinagar", 4.3, 3.9],
    ["Pink City Screens", "Jaipur", "MI Road, Panch Batti", 4.2, 4.1],
    ["Rajwada Talkies", "Indore", "AB Road, Vijay Nagar", 4.0, 5.2],
    ["Upper Lake Cinemas", "Bhopal", "New Market, TT Nagar", 4.2, 3.3],
  ];

export const THEATRES: Theatre[] = theatreSeeds.map((t, i) => ({
  id: `t${i + 1}`,
  name: t[0],
  city: t[1],
  address: t[2],
  rating: t[3],
  distanceKm: t[4],
  screens: [
    { id: `t${i + 1}-s1`, name: "Screen 1", seats: 150 },
    { id: `t${i + 1}-s2`, name: "Screen 2", seats: 200 },
    { id: `t${i + 1}-s3`, name: "Screen 3", seats: 120 },
  ],
  formats: allFormats[(i + 2) % allFormats.length]!,
}));

export const OFFERS = [
  {
    code: "FIRST100",
    title: "First Movie",
    description: "Flat ₹100 off on your first booking with CineBook.",
    type: "flat" as const,
    value: 100,
    icon: "🎟️",
  },
  {
    code: "MOVIE10",
    title: "Card Offer",
    description: "10% instant discount on selected cards (max ₹150).",
    type: "percent" as const,
    value: 10,
    max: 150,
    icon: "💳",
  },
  {
    code: "WEEKDAY50",
    title: "Weekday Saver",
    description: "₹50 off on any weekday show. Because Tuesdays deserve popcorn.",
    type: "flat" as const,
    value: 50,
    icon: "🍿",
  },
];

export type Offer = (typeof OFFERS)[number];
