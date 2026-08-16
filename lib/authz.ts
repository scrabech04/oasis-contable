import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  AUTH_SESSION_COOKIE,
  AuthRole,
  ROLE_ACCOUNTANT,
  ROLE_OWNER,
  getAuthSecret,
  isEmailAllowed,
  sessionRole,
  verifySessionToken,
} from "@/lib/auth";

export class ForbiddenError extends Error {
  constructor(message = "Tu cuenta es de solo lectura: no puede crear, editar ni eliminar.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export type CurrentUser = {
  email: string;
  role: AuthRole;
};

/**
 * Quien esta pidiendo, segun la cookie firmada.
 *
 * Devuelve null cuando no hay sesion. Eso pasa en las rutas MCP, que no llevan cookie y se
 * autentican con su propia clave (lib/mcp.ts), y en los procesos de fondo. Por eso la
 * ausencia de sesion NO se interpreta como contador: quien decide ahi es el otro guardia.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  let token: string | undefined;
  try {
    token = (await cookies()).get(AUTH_SESSION_COOKIE)?.value;
  } catch {
    // Fuera del alcance de una peticion (scripts, cron): no hay usuario que resolver.
    return null;
  }

  const session = await verifySessionToken(token, getAuthSecret());
  if (!session) return null;
  return { email: session.email, role: sessionRole(session) };
}

export async function isAccountant() {
  const user = await getCurrentUser();
  return user?.role === ROLE_ACCOUNTANT;
}

/**
 * Guardia de escritura. Va al principio de toda accion que cree, modifique o borre.
 *
 * Es la segunda capa: el middleware ya rechaza las server actions del contador antes de
 * llegar aqui (lib/access.ts). Se repite a proposito, porque el middleware es facil de
 * romper sin darse cuenta al tocar el matcher, y porque una accion puede invocarse desde
 * codigo que no pasa por el.
 */
export async function requireWriteAccess() {
  const user = await getCurrentUser();
  if (user && user.role !== ROLE_OWNER) {
    throw new ForbiddenError();
  }
  return user;
}

/**
 * Perfiles que este usuario puede mirar. `null` significa "todos" (el dueno).
 */
export async function allowedProfileIds(): Promise<number[] | null> {
  const user = await getCurrentUser();
  if (!user || user.role === ROLE_OWNER) return null;

  const record = await prisma.appUser.findUnique({
    where: { email: user.email },
    select: { status: true, profiles: { select: { profileId: true } } },
  });
  if (!record || record.status !== "ACTIVE") return [];
  return record.profiles.map((row) => row.profileId);
}

/**
 * Rol con el que se debe emitir la sesion de este correo, o null si no puede entrar.
 *
 * El orden importa: AUTH_ALLOWED_EMAILS manda. Asi el dueno nunca se queda fuera aunque la
 * tabla AppUser este vacia o mal, que es justo el estado en el que queda al desplegar esto
 * por primera vez.
 */
export async function resolveLoginRole(email: string): Promise<AuthRole | null> {
  const normalized = email.trim().toLowerCase();
  if (isEmailAllowed(normalized)) return ROLE_OWNER;

  const user = await prisma.appUser.findUnique({
    where: { email: normalized },
    select: { role: true, status: true },
  });
  if (!user || user.status !== "ACTIVE") return null;
  return user.role === ROLE_OWNER ? ROLE_OWNER : ROLE_ACCOUNTANT;
}

export async function markLogin(email: string) {
  await prisma.appUser.updateMany({
    where: { email: email.trim().toLowerCase() },
    data: { lastLoginAt: new Date() },
  });
}
