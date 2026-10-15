export const animation = `<!doctype html>
<html><head><meta charset="utf-8"><title>SVG animation</title>
<style>body{margin:0;background:#f0faf5}svg{width:100%;height:100vh}</style>
</head><body><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600">
<rect width="960" height="600" fill="#e5f5ef"/>
<circle cx="200" cy="300" r="60" fill="#d74c63">
<animate attributeName="cx" values="200;760;200" dur="2s" repeatCount="indefinite"/>
</circle></svg><script>document.body.dataset.ready="yes";</script></body></html>`;
