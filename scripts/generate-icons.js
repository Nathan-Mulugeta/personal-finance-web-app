import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = join(__dirname, '..', 'public');

// Create a simple icon with the app's primary color (#1a73e8)
const createIcon = async (size, outputPath) => {
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="#1a73e8"/>
      <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="${size * 0.3}" 
            font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">$</text>
    </svg>
  `;

  await sharp(Buffer.from(svg))
    .png()
    .toFile(outputPath);
};

const generateIcons = async () => {
  console.log('Generating PWA icons...');
  
  // Generate 192x192 icon
  await createIcon(192, join(publicDir, 'pwa-192x192.png'));
  console.log('✓ Created pwa-192x192.png');
  
  // Generate 512x512 icon
  await createIcon(512, join(publicDir, 'pwa-512x512.png'));
  console.log('✓ Created pwa-512x512.png');
  
  // Generate apple-touch-icon (180x180)
  await createIcon(180, join(publicDir, 'apple-touch-icon.png'));
  console.log('✓ Created apple-touch-icon.png');
  
  console.log('All icons generated successfully!');
};

generateIcons().catch(console.error);

