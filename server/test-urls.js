const axios = require('axios');

async function testAccount() {
  try {
    const res = await axios.get('https://account.premierleague.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    });
    console.log('account.premierleague.com status:', res.status);
    console.log('Final URL:', res.request.res.responseUrl || res.config.url);
  } catch (e) {
    console.error('Error:', e.response ? e.response.status : e.message);
  }
}

testAccount();
