const { createCanvas, loadImage } = require('@napi-rs/canvas')
const fs = require('fs');
const path = require('path');

async function generateIcon() {
    const size = 1024; // Standard icon size
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Create rounded rectangle with gradient background
    const cornerRadius = size * 0.2;
    ctx.beginPath();
    ctx.moveTo(cornerRadius, 0);
    ctx.lineTo(size - cornerRadius, 0);
    ctx.arcTo(size, 0, size, cornerRadius, cornerRadius);
    ctx.lineTo(size, size - cornerRadius);
    ctx.arcTo(size, size, size - cornerRadius, size, cornerRadius);
    ctx.lineTo(cornerRadius, size);
    ctx.arcTo(0, size, 0, size - cornerRadius, cornerRadius);
    ctx.lineTo(0, cornerRadius);
    ctx.arcTo(0, 0, cornerRadius, 0, cornerRadius);
    ctx.closePath();

    // Add gradient background - different colors for dev vs production
    const isDev = process.env.NODE_ENV === 'development';
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    
    if (isDev) {
        // Orange gradient for development
        gradient.addColorStop(0, '#ff8c00');
        gradient.addColorStop(1, '#ff4500');
    } else {
        // Blue gradient for production
        gradient.addColorStop(0, '#00d2ff');
        gradient.addColorStop(1, '#3a7bd5');
    }
    
    ctx.fillStyle = gradient;
    ctx.fill();

    // Load and draw the logo
    const logo = await loadImage(path.join(__dirname, '../src/web/client/public/logo.svg'));
    const logoSize = size * 0.6;
    const logoX = (size - logoSize) / 2;
    const logoY = (size - logoSize) / 2;
    ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);

    // Save the icon
    const distFolder = path.join(__dirname, '../dist');
    if (!fs.existsSync(distFolder)) fs.mkdirSync(distFolder);
    const outPath = path.join(__dirname, '../dist/icon.png');
    fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
    console.log(`Icon generated at ${outPath}`);
}

generateIcon().catch(console.error);
