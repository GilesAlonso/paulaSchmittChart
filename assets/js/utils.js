export function truncateText(text, maxLength = 40) {
  if (!text || typeof text !== 'string') {
    return '';
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}

export function formatDate(dateString) {
  if (!dateString) {
    return 'Data indisponível';
  }

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return 'Data indisponível';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date);
}

export function lightenColor(hex, amount = 0.18) {
  if (!hex) {
    return '#94a3b8';
  }

  const safeHex = hex.replace('#', '');
  if (safeHex.length !== 6) {
    return hex;
  }

  const num = parseInt(safeHex, 16);
  const r = Math.min(255, Math.round(((num >> 16) & 0xff) + 255 * amount));
  const g = Math.min(255, Math.round(((num >> 8) & 0xff) + 255 * amount));
  const b = Math.min(255, Math.round((num & 0xff) + 255 * amount));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b)
    .toString(16)
    .slice(1)}`;
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function downloadBlob(content, filename, mimeType = 'application/octet-stream') {
  const blob = new Blob([content], { type: mimeType });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function compareBy(property, direction = 'desc') {
  return (a, b) => {
    if (a[property] === b[property]) {
      return 0;
    }

    if (direction === 'asc') {
      return a[property] > b[property] ? 1 : -1;
    }
    return a[property] < b[property] ? 1 : -1;
  };
}

export function toLocaleNumber(value) {
  return new Intl.NumberFormat('pt-BR').format(value);
}
