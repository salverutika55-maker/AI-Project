import crypto from 'crypto';

const IV_LENGTH = 12; // GCM optimal IV length is 12 bytes

function getEncryptionKey() {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY environment variable is required and must be 32 characters');
  }

  return Buffer.from(encryptionKey);
}

export function encrypt(text: string): string {
  if (!text) return text;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  
  // Format: iv:authTag:encryptedText
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(text: string): string {
  if (!text) return text;
  try {
    const parts = text.split(':');
    
    // Fallback for old AES-256-CBC format (iv:encrypted)
    if (parts.length === 2) {
      const iv = Buffer.from(parts[0], 'hex');
      const encryptedText = Buffer.from(parts[1], 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', getEncryptionKey(), iv);
      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString();
    }
    
    // New AES-256-GCM format (iv:authTag:encrypted)
    if (parts.length === 3) {
      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encryptedText = parts[2];
      
      const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }
    
    return text;
  } catch (error) {
    console.error("Decryption failed:", error);
    return text; // Return original if not encrypted
  }
}
