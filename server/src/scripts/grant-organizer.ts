import { prisma } from "../config/prisma.ts";

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();

  if (!email) {
    throw new Error(
      'Укажи email пользователя: npx tsx src/scripts/grant-organizer.ts "user@example.com"',
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
    },
  });

  if (!user) {
    throw new Error(
      `Пользователь ${email} не найден. Сначала зарегистрируй аккаунт.`,
    );
  }

  await prisma.userRole.upsert({
    where: {
      userId_role: {
        userId: user.id,
        role: "ORGANIZER",
      },
    },
    update: {},
    create: {
      userId: user.id,
      role: "ORGANIZER",
    },
  });

  console.log(`Роль ORGANIZER назначена пользователю ${user.email}.`);
}

main()
  .catch((error: unknown) => {
    console.error("Не удалось назначить роль организатора:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });