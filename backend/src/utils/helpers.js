export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function toDate(period) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  let end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  switch (period) {
    case 'today':
      break;
    case 'week': {
      const day = now.getDay() || 7;
      start.setDate(now.getDate() - day + 1);
      break;
    }
    case 'month':
      start.setDate(1);
      break;
    case 'last_month': {
      start.setFullYear(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case 'last_3_months':
      start.setMonth(firstOfMonth.getMonth() - 2);
      start.setDate(1);
      break;
    case 'last_6_months':
      start.setMonth(firstOfMonth.getMonth() - 5);
      start.setDate(1);
      break;
    case 'year':
      start.setMonth(0, 1);
      break;
    case 'last_year': {
      start.setFullYear(now.getFullYear() - 1, 0, 1);
      end = new Date(now.getFullYear() - 1, 11, 31);
      end.setHours(23, 59, 59, 999);
      break;
    }
    default:
      start.setDate(1);
  }

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function formatMoney(value, currency = 'COP') {
  const v = Number(value || 0);
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(v);
}

export function buildPagination({ page = 1, limit = 10 }) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(200, Math.max(1, parseInt(limit, 10) || 10));
  return { page: p, limit: l, offset: (p - 1) * l };
}

export function getIp(req) {
  return req.ip || req.connection?.remoteAddress || null;
}
