import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const filePath = join(__dirname, 'roblox-ahh-tycoon-song-1767145059787.webm');

try {
    const fileBuffer = readFileSync(filePath);
    console.log(`File size: ${fileBuffer.length} bytes (${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
    
    // Check WebM header (first 4 bytes should be 0x1A 0x45 0xDF 0xA3)
    const header = fileBuffer.slice(0, 4);
    const webmHeader = [0x1A, 0x45, 0xDF, 0xA3];
    const isValidWebM = header[0] === webmHeader[0] && 
                       header[1] === webmHeader[1] && 
                       header[2] === webmHeader[2] && 
                       header[3] === webmHeader[3];
    
    console.log(`WebM header valid: ${isValidWebM}`);
    console.log(`First 4 bytes: ${Array.from(header).map(b => '0x' + b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}`);
    
    // Check last few bytes (should have closing elements)
    const footer = fileBuffer.slice(-16);
    console.log(`Last 16 bytes: ${Array.from(footer).map(b => '0x' + b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}`);
    
    // Look for EBML elements (simplified - just check for common patterns)
    console.log('\n=== Basic File Structure ===');
    console.log('Note: Full packet analysis requires ffprobe or a proper WebM parser');
    console.log('To get detailed packet timestamps, please install ffmpeg and run:');
    console.log('  ffprobe -hide_banner -show_packets -select_streams v -of compact=p=0:nk=1 <file> | head -n 20');
    
} catch (error) {
    console.error('Error analyzing file:', error.message);
}


