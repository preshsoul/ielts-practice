const targets = [
  process.env.LOCI_BACKEND_HEALTH_URL || "http://127.0.0.1:8000/healthz",
];

const results = [];

for (const url of targets) {
  try {
    const response = await fetch(url, { method: "GET" });
    results.push({ url, ok: response.ok, status: response.status });
  } catch (error) {
    results.push({ url, ok: false, status: null, message: error.message });
  }
}

console.log(JSON.stringify(results, null, 2));

if (results.some((item) => !item.ok)) {
  process.exit(1);
}
