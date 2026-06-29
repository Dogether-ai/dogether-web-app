import prisma from './config/database';
import { createClient } from 'redis';

async function main() {
  console.log('🧹 Clearing Dogether database tables...');
  
  // Clean DB tables in dependent order (child tables first)
  const deletedMessages = await prisma.message.deleteMany();
  console.log(`- Deleted ${deletedMessages.count} messages.`);

  const deletedSessions = await prisma.taskSession.deleteMany();
  console.log(`- Deleted ${deletedSessions.count} task sessions.`);

  const deletedTasks = await prisma.task.deleteMany();
  console.log(`- Deleted ${deletedTasks.count} tasks.`);

  const deletedUsers = await prisma.user.deleteMany();
  console.log(`- Deleted ${deletedUsers.count} users.`);

  console.log('✅ PostgreSQL database tables cleared successfully!');

  // Clean Redis cache
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const client = createClient({ url: redisUrl });
    await client.connect();
    await client.flushAll();
    await client.disconnect();
    console.log('✅ Redis database flushed successfully!');
  } catch (err) {
    console.log('ℹ️ Redis is offline or not running (using memory fallback). Backend restart will clear memory users.');
  }
}

main()
  .catch((err) => {
    console.error('❌ Error clearing database:', err);
  })
  .finally(() => {
    process.exit(0);
  });
