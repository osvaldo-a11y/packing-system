require('dotenv').config();

async function api(path, options = {}) {
  const res = await fetch(`http://localhost:${process.env.PORT || 3000}${path}`, options);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  const users = JSON.parse(process.env.AUTH_USERS_JSON || '[]');
  const admin = users.find((u) => u.role === 'admin') || users[0];
  if (!admin) throw new Error('No hay usuarios en AUTH_USERS_JSON');

  const login = await api('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: admin.username, password: admin.password }),
  });
  const token = login.access_token;
  if (!token) throw new Error('Login sin token');

  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
  };

  const species = await api('/api/masters/species', { headers });
  const selected = (species || []).slice(0, 3);
  if (!selected.length) throw new Error('No hay especies en maestro');

  const prices = [0.12, 0.135, 0.155];
  for (let i = 0; i < selected.length; i += 1) {
    const s = selected[i];
    await api('/api/reporting/packing-costs', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        species_id: Number(s.id),
        season: '',
        price_per_lb: prices[i] ?? 0.12,
        active: true,
      }),
    });
  }

  const list = await api('/api/reporting/packing-costs', { headers });
  const report = await api('/api/reporting/format-cost?page=1&limit=20', { headers });

  const preview = (report?.formatCostSummary?.rows || []).slice(0, 5).map((r) => ({
    format_code: r.format_code,
    species_name: r.species_name,
    precio_packing_por_lb: r.precio_packing_por_lb,
  }));

  console.log(
    JSON.stringify(
      {
        seeded_species: selected.map((s, i) => ({ id: s.id, nombre: s.nombre, price_per_lb: prices[i] })),
        packing_costs_count: Array.isArray(list) ? list.length : null,
        packing_source: report?.config?.packing_source ?? null,
        format_summary_preview: preview,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
