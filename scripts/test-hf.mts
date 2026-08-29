import { fetchHfLeaderboard, buildHfLookup, matchHfLeaderboardModel } from './hf-utils.mts'

async function main() {
  try {
    const entries = await fetchHfLeaderboard('.tmp/hf_leaderboard.json', {
      noCache: false, force: false, timeout: 30000, retries: 3,
      leaderboardMaxAgeMs: 24 * 60 * 60 * 1000,
      verbose: true,
    })
    console.log('entries:', entries.length)
    if (entries.length > 0) {
      console.log('sample:', JSON.stringify(entries.slice(0, 3), null, 2))
    }
    const lookup = buildHfLookup(entries)
    console.log('lookup size:', lookup.size)

    // Test matching
    const test1 = matchHfLeaderboardModel('meta-llama/Llama-3.1-70B-Instruct', 'llama-3-1-70b-instruct', 'Meta Llama 3.1 70B Instruct', 'meta-llama/llama-3.1-70b-instruct', lookup)
    console.log('match test 1:', JSON.stringify(test1, null, 2))
  } catch (e) {
    console.error('ERROR:', e)
  }
}

main()
