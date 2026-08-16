-- Usuarios de la aplicacion y su alcance por perfil.
-- Antes de esto el permiso vivia solo en la variable AUTH_ALLOWED_EMAILS, que no sabe
-- distinguir roles: todo el que entraba entraba como dueno.

CREATE TABLE "AppUser" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'ACCOUNTANT',
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "inviteTokenHash" TEXT,
    "inviteExpiresAt" TIMESTAMP(3),
    "invitedByEmail" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser"("email");
CREATE UNIQUE INDEX "AppUser_inviteTokenHash_key" ON "AppUser"("inviteTokenHash");

CREATE TABLE "AppUserProfile" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "profileId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppUserProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppUserProfile_userId_profileId_key" ON "AppUserProfile"("userId", "profileId");

ALTER TABLE "AppUserProfile" ADD CONSTRAINT "AppUserProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AppUserProfile" ADD CONSTRAINT "AppUserProfile_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "AccountProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
