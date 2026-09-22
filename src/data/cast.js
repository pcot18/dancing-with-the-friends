// Season 35 cast, per ABC's Sept 2, 2026 announcement. Scouting copy is the league's.
// This file seeds both demo mode and supabase/seed.sql (npm run gen:seed).

export const SEASON = { id: 1, name: 'Season 35', year: 2026 }

// Week numbering follows Wikipedia's scoring chart (premiere night 1 = week 1, night 2 = week 2),
// so the auto-fill parser lines up. Live draft room opens Tuesday 7:30pm ET; show lock 8pm ET.
export const WEEKS = [
  { number: 1,  title: 'Premiere Night 1',  tuesday: '2026-09-15' },
  { number: 2,  title: 'Premiere Night 2',  tuesday: '2026-09-16' },
  { number: 3,  title: 'Viral Hits Night',  tuesday: '2026-09-22' },
  { number: 4,  title: 'Yacht Rock Night',  tuesday: '2026-09-29' },
  { number: 5,  title: 'Week 5',            tuesday: '2026-10-06' },
  { number: 6,  title: 'Week 6',            tuesday: '2026-10-13' },
  { number: 7,  title: 'Week 7',            tuesday: '2026-10-20' },
  { number: 8,  title: 'Week 8',            tuesday: '2026-10-27' },
  { number: 9,  title: 'Week 9',            tuesday: '2026-11-03' },
  { number: 10, title: 'Week 10',           tuesday: '2026-11-10' },
  { number: 11, title: 'Semifinal',         tuesday: '2026-11-17' },
  { number: 12, title: 'Finale',            tuesday: '2026-11-24' },
]

// ET offset: EDT (-4) until Nov 1 2026, EST (-5) after.
export function etToUtc(dateStr, hour, minute = 0) {
  const offset = dateStr >= '2026-11-01' ? 5 : 4
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCHours(hour + offset, minute)
  return d.toISOString()
}
export function weekLocks(w) {
  return { draft_opens_at: etToUtc(w.tuesday, 19, 30), show_lock_at: etToUtc(w.tuesday, 20) }
}

// Real judges' scores so far (3 judges, /30). Premiere: men night 1, women night 2, one elimination each.
export const SCORES = [
  { week: 1, couple: 7,  total: 15 }, { week: 1, couple: 9,  total: 17 }, { week: 1, couple: 8,  total: 12, eliminated: true },
  { week: 1, couple: 11, total: 10 }, { week: 1, couple: 6,  total: 20 }, { week: 1, couple: 13, total: 16 },
  { week: 1, couple: 10, total: 16 }, { week: 1, couple: 2,  total: 21 },
  { week: 2, couple: 4,  total: 12 }, { week: 2, couple: 3,  total: 18 }, { week: 2, couple: 14, total: 15 },
  { week: 2, couple: 16, total: 16 }, { week: 2, couple: 5,  total: 18 }, { week: 2, couple: 12, total: 21 },
  { week: 2, couple: 15, total: 14, eliminated: true }, { week: 2, couple: 1,  total: 19 },
]

export const COUPLES = [
  { id: 1, celeb: 'Jenna Dewan', pro: 'Val Chmerkovskiy', known_for: 'Step Up, The Rookie', tier: 1,
    position: 'Franchise quarterback', grade: 'A+', floor: 22, ceiling: 30,
    comp: 'Jordan Fisher, S25 champion', vote_engine: 'Step Up nostalgia, The Rookie',
    bio: "Toured behind Janet Jackson and Missy Elliott, made Step Up a franchise, then hosted World of Dance and judged SYTYCD, which means she has literally been paid to evaluate the thing she's now competing in. Paired with Val, who has two Mirrorballs and no interest in third place. This is the Nicole Scherzinger problem: the show cast a professional and everyone is going to act surprised.",
    red_flag: "The judges' only move is to score her a 7 in week one \"for growth.\" Budget for it." },
  { id: 2, celeb: 'Harry Shum Jr.', pro: 'Jenna Johnson', known_for: 'Glee, Grey\'s Anatomy', tier: 1,
    position: 'Two-way superstar', grade: 'A', floor: 21, ceiling: 30,
    comp: 'Corbin Bleu, S17 runner-up', vote_engine: "Glee, Grey's, Everything Everywhere",
    bio: "Mike Chang on Glee was a dancer who got cast as an actor, not the other way around. Backup dancer for Beyoncé, JLo and Mariah, two Step Up sequels, and a Crazy Rich Asians spinoff on deck. Jenna Johnson has won this show. The scary part isn't the technique, it's that he can act the story of a rumba, which is what separates a 27 from a 30.",
    red_flag: 'Dewan already claimed the "wait, they\'re a real dancer?" storyline, and the show only writes one of those per season.' },
  { id: 3, celeb: 'Amber Glenn', pro: 'Pasha Pashkov', known_for: 'Olympic figure skating', tier: 1,
    position: 'Elite athlete, musical', grade: 'A', floor: 20, ceiling: 30,
    comp: 'Kristi Yamaguchi, S6 champ · Meryl Davis, S18 champ', vote_engine: 'Fresh off the 2026 Games',
    bio: "Olympic gold medalist, three-time U.S. champion, first American woman to land three triple Axels at one Games. Figure skaters have the best track record of any athlete category on this show because the job is already \"perform choreography to music while judges hold up numbers.\" The first openly LGBTQ+ U.S. women's champion, with a fanbase that votes like it's a tournament.",
    red_flag: 'Skaters sometimes look like they\'re waiting for the ice to show up. Pasha will fix that by week 3.' },
  { id: 4, celeb: 'Tatyana Ali', pro: 'Jan Ravnik', known_for: 'The Fresh Prince of Bel-Air', tier: 1,
    position: 'Veteran, Broadway pedigree', grade: 'A−', floor: 19, ceiling: 29,
    comp: 'Alfonso Ribeiro, S19 champion', vote_engine: 'Fresh Prince, Abbott Elementary',
    bio: "Ashley Banks, all six seasons. Broadway in Fences. Five NAACP Image Awards. And here's the plot: her TV brother Carlton won this show and is now standing at the podium hosting it. That's not a storyline, that's a season-long arc the producers are going to milk until it screams.",
    red_flag: 'Everyone\'s going to yell "do the Carlton" and at some point, God help her, she will.' },
  { id: 5, celeb: 'Julia Stiles', pro: 'Ezra Sosa', known_for: '10 Things I Hate About You', tier: 2,
    position: 'Sleeper with a résumé', grade: 'B+', floor: 18, ceiling: 28,
    comp: 'Zendaya, S16 runner-up (minus the youth)', vote_engine: 'Every millennial who owned a Save the Last Dance DVD',
    bio: "Emmy and Golden Globe nominee, Kat Stratford, Bourne, Dexter, and a feature directing debut in 2025. But the whole league knows what this is about: in 2001 she did ballet-to-hip-hop for two hours in Save the Last Dance, and either that training is still in there or it isn't. Ezra Sosa choreographs like he's auditioning for a Mirrorball, which he is.",
    red_flag: 'An actress this good at playing reserved may take three weeks to look like she\'s enjoying herself. The judges score joy.' },
  { id: 6, celeb: 'Ezra Frech', pro: 'Daniella Karagach', known_for: 'Paralympic gold medalist', tier: 2,
    position: 'Elite athlete, explosive', grade: 'B+', floor: 18, ceiling: 29,
    comp: 'Amy Purdy, S18 runner-up · Noah Galloway, S20 third', vote_engine: 'Paralympic gold, motivational-speaker charisma',
    bio: "Paralympic gold medalist, world-record holder, co-founder of Angel City Sports, and a professional speaker, which means he already knows how to hold a room for ninety seconds. Daniella Karagach won a Mirrorball with an NBA player and has a documented gift for turning athletes into dancers by week 4. A producer's dream, and the judges will be generous with the growth arc.",
    red_flag: 'None. If you draft against him at the watch party you are going to have to explain yourself.' },
  { id: 7, celeb: 'Jackson Olson', pro: 'Emma Slater', known_for: 'Savannah Bananas', tier: 2,
    position: 'Athlete who dances for a living', grade: 'B+', floor: 17, ceiling: 28,
    comp: 'Ilona Maher, S33 runner-up', vote_engine: 'Savannah Bananas social media, which is enormous',
    bio: "Plays for the Savannah Bananas, a baseball team whose entire business model is choreographed dance breaks between innings. So: a professional athlete with hundreds of reps performing rehearsed routines in sold-out stadiums, plus a following that already knows how to vote on their phones. Emma Slater has a Mirrorball and a reputation for making big guys look light.",
    red_flag: 'Banana Ball choreography is 40% hip thrust. The paso doble is not.' },
  { id: 8, celeb: 'Conner Leavitt', pro: 'Adele Zaikman', known_for: 'The Secret Lives of Mormon Wives', tier: 2, eliminated_week: 1,
    position: 'The sequel, in a good way', grade: 'B', floor: 17, ceiling: 27,
    comp: 'His wife, one season ago', vote_engine: 'The entire Mormon Wives audience, redirected',
    bio: "Whitney Leavitt went deep in season 34; now the \"Instagram husband\" gets his turn. Except he isn't just a plus-one: he made his off-Broadway debut in May, so there's stage training. Partnered with Adele Zaikman, the rookie pro who won The Next Pro and will be dancing like her contract depends on it. He also has a live-in coach who knows what Carrie Ann is going to say before she says it.",
    red_flag: 'Rookie pros historically go home early. Also his household now contains two people who\'ve done this, which is either a superpower or a divorce.' },
  { id: 9, celeb: 'Tyler Cameron', pro: 'Sharna Burgess', known_for: 'The Bachelorette', tier: 2,
    position: 'Athletic, coachable, tall', grade: 'B', floor: 17, ceiling: 27,
    comp: 'Hannah Brown, S28 champion (yes, that one)', vote_engine: 'Bachelor Nation, HGTV crossover',
    bio: "Former college football player, runner-up on Hannah Brown's Bachelorette, and the franchise's most famous case of losing the girl and winning the internet. Hannah then won this show, so there is a narrative. Sharna Burgess is back after five years away and won her Mirrorball with a radio host who could not dance, which tells you what she does with a man who takes direction.",
    red_flag: "6'4\" in a jive. Long limbs are a cha-cha problem until they aren't." },
  { id: 10, celeb: 'Taylor Hanson', pro: 'Britt Stewart', known_for: 'Hanson', tier: 2,
    position: 'Musician, rhythm-first', grade: 'B', floor: 17, ceiling: 27,
    comp: 'Joey Fatone, S4 runner-up', vote_engine: 'Thirty years of Hanson fans, seven children',
    bio: "The middle Hanson, keys and lead vocals, famous since 1997, still touring. Musicians reliably hear the count, and keys players hear it best. Father of seven, so the \"I've never had a moment to myself\" package writes itself. Britt Stewart is a strong technician who's been waiting for a partner with rhythm.",
    red_flag: 'Hearing the beat and moving your hips on it are, tragically, different skills. Ask every guitarist who\'s ever been on this show.' },
  { id: 11, celeb: 'Guillermo Rodriguez', pro: 'Witney Carson', known_for: 'Jimmy Kimmel Live!', tier: 3,
    position: 'Fan-vote monster · low ceiling', grade: 'C+', floor: 12, ceiling: 22,
    comp: 'Bobby Bones, S27 champion, the darkest day in judging history', vote_engine: '23 years of Kimmel viewers, every Oscars red carpet',
    bio: "Discovered as a parking-lot security guard, now the most beloved man in late night. The paddles will be cruel and it will not matter, because America will vote for him until he's physically dragged from the ballroom. The half-points-if-eliminated rule was written with him in mind, in the opposite direction: he's the safest low-score pick on the board.",
    red_flag: 'He will outlast someone with a 28. Everyone at the party will say the show is rigged. The show is not rigged, it\'s just Guillermo.' },
  { id: 12, celeb: 'Maura Higgins', pro: 'Mark Ballas', known_for: 'Love Island, The Traitors', tier: 3,
    position: 'Reality all-star · high volatility', grade: 'B−', floor: 15, ceiling: 26,
    comp: 'Joey Graziadei, S33 champion', vote_engine: 'Love Island, The Traitors, the Birkin apology',
    bio: "Love Island UK breakout, Aftersun host, and runner-up on The Traitors after a betrayal that got weeks of coverage and an actual Birkin bag as an apology. That is a fanbase that does not forget and does vote. Mark Ballas is a three-time champion who came out of retirement once already to win with a TikTok star; he does not come back for fun.",
    red_flag: 'Scores may lag the votes by a lot, so as a weekly pick she\'s a coin flip. Draft her the week the theme is anything with a wind machine.' },
  { id: 13, celeb: 'Connor Wood', pro: 'Rylee Arnold', known_for: 'Fibula, comedian & podcaster', tier: 3,
    position: 'Internet · unknown skill', grade: 'C+', floor: 14, ceiling: 25,
    comp: 'Alix Earle, S34', vote_engine: '1.3M followers, a national comedy tour, NBC Olympics gig',
    bio: "\"Fibula\" to his followers, co-host of Brooke and Connor Make a Podcast, and a working stand-up who put Ilana Glazer on his tour. Comedians survive on this show because the packages are funny and the votes follow. Rylee Arnold has been to the finale already and picks choreography like she's trying to end careers. Wildly unknown floor.",
    red_flag: 'If he\'s bad, he will be bad on purpose for the bit, and the judges have no idea how to score a bit.' },
  { id: 14, celeb: 'Ciara Miller', pro: 'Brandon Armstrong', known_for: 'Summer House', tier: 3,
    position: 'Bravo · momentum play', grade: 'C+', floor: 15, ceiling: 25,
    comp: 'Ariana Madix, S32 finalist', vote_engine: 'Summer House, plus a 2026 betrayal storyline the internet took personally',
    bio: "Summer House's most influential export, per Bravo, and this year the wronged party in a public ex-and-friend situation that turned a whole fanbase into a voting bloc. The Ariana Madix precedent is instructive: Bravo women with a grievance and a good pro make the finale. Brandon Armstrong has never had a partner with this much narrative wind at her back.",
    red_flag: "It's a nurse's schedule and a Bravo schedule and a DWTS rehearsal schedule. Something's giving." },
  { id: 15, celeb: 'Sarah Jane Nader', pro: 'Hailey Bills', known_for: 'Love Thy Nader', tier: 3, eliminated_week: 2,
    position: 'Same-sex pairing · rookie pro', grade: 'C', floor: 14, ceiling: 24,
    comp: 'Her sister Brooks, S33, ninth place', vote_engine: 'Love Thy Nader, the Nader sister multiverse',
    bio: "Actress, model, star of Love Thy Nader, and the second Nader sister to enter the ballroom after Brooks went out ninth. The season's same-sex pairing, with Hailey Bills promoted from the ensemble to pro. First-year pros go home early far more often than not, but a same-sex partnership means both dancers can lead and follow, and the choreography can go places the standard pairings can't.",
    red_flag: 'Four other reality stars are splitting the same vote. Someone from this tier goes home week 2 and it\'s probably not Guillermo.' },
  { id: 16, celeb: 'Giada De Laurentiis', pro: 'Alan Bersten', known_for: 'Food Network', tier: 3,
    position: 'Celebrity chef · veteran presence', grade: 'C', floor: 13, ceiling: 23,
    comp: "Carole Baskin's scores, Paula Deen's exit", vote_engine: "Fifteen seasons of Everyday Italian, everyone's mom",
    bio: "Emmy winner, restaurateur, the face of Food Network for two decades. Chefs have not historically done well here, but chefs have also not historically been paired with Alan Bersten, a champion who can teach anyone a Viennese waltz. She's camera-trained, composed under pressure, and used to doing precise things with her hands while someone counts down. That's more relevant than it sounds.",
    red_flag: 'Every package will involve a kitchen. Every one. Bruno will make a pasta joke and it will cost her a point.' },
]

export const TIERS = { 1: 'The Ringers', 2: 'The Contenders', 3: 'The Vote Machines' }
