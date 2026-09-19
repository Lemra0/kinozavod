import QRCode from 'qrcode';

/** Renders a ticket code as an inline SVG QR string. */
export async function qrSvg(text) {
  return QRCode.toString(text, {
    type: 'svg',
    margin: 0,
    errorCorrectionLevel: 'M',
    color: { dark: '#1b1a17', light: '#00000000' },
  });
}
