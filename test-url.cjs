const https = require('https');

https.get('https://agicare-henna.vercel.app/login', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    const match = data.match(/NEXT_PUBLIC_SUPABASE_URL:"(.*?)"/);
    if (match) {
      console.log("Vercel Supabase URL:", match[1]);
    } else {
      console.log("Not found in HTML directly. Looking for JS files...");
      const jsFiles = data.match(/src="(\/_next\/static\/chunks\/[^"]+)"/g) || [];
      jsFiles.forEach(src => {
        const url = 'https://agicare-henna.vercel.app' + src.match(/"(.*?)"/)[1];
        https.get(url, (jsRes) => {
          let jsData = '';
          jsRes.on('data', (chunk) => { jsData += chunk; });
          jsRes.on('end', () => {
            const jsMatch = jsData.match(/NEXT_PUBLIC_SUPABASE_URL:"(.*?)"/);
            if (jsMatch) console.log("Found in", url, ":", jsMatch[1]);
          });
        });
      });
    }
  });
});
