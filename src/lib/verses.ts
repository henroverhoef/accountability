// Grace-focused verses shown after a hard day. Add your own favourites here.
export const GRACE_VERSES = [
  { ref: '1 John 1:9', text: 'If we confess our sins, he is faithful and just and will forgive us our sins and purify us from all unrighteousness.' },
  { ref: 'Lamentations 3:22–23', text: 'Because of the Lord’s great love we are not consumed, for his compassions never fail. They are new every morning; great is your faithfulness.' },
  { ref: 'Romans 8:1', text: 'Therefore, there is now no condemnation for those who are in Christ Jesus.' },
  { ref: 'Proverbs 24:16', text: 'For though the righteous fall seven times, they rise again.' },
  { ref: '1 Corinthians 10:13', text: 'God is faithful; he will not let you be tempted beyond what you can bear. But when you are tempted, he will also provide a way out so that you can endure it.' },
  { ref: 'Micah 7:8', text: 'Though I have fallen, I will rise. Though I sit in darkness, the Lord will be my light.' },
  { ref: 'Psalm 51:10', text: 'Create in me a pure heart, O God, and renew a steadfast spirit within me.' },
]

export const ENCOURAGEMENTS = [
  'Thanks for showing up today. Honesty is a big deal.',
  'Checked in. One faithful step at a time.',
  'Well done for being honest. Keep going.',
  'Another day of walking in the light.',
  'Showing up matters. See you tomorrow.',
]

/** Pick an item that changes each day but is stable within a day. */
export function pickForDay<T>(list: T[], date: string): T {
  const n = Number(date.replaceAll('-', ''))
  return list[n % list.length]
}

export function pickRandom<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)]
}
