import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import * as s from "./schema";
import { isManager, type Principal } from "./policy";
import { authorizedMember } from "./access";
import { mentionsRole } from "../lib/schedule";
import { unitRoles } from "../lib/unit-roles";
/** Canonical role slots exist without granting any new account access. */
export async function ensureUnitRoleGroups(p: Principal) {
  if (!isManager(p)) return;
  const db = await getDb();
  const members = await db
    .select({
      email: s.user.email,
      name: s.user.name,
      companyId: s.memberships.companyId,
      domainId: s.memberships.domainId,
      role: s.memberships.role,
    })
    .from(s.memberships)
    .innerJoin(s.user, eq(s.memberships.userId, s.user.id))
    .where(
      and(
        eq(s.memberships.organizationId, p.organizationId),
        eq(s.memberships.active, true),
        authorizedMember(p.organizationId),
      ),
    );
  const eligible = new Set(
    members
      .filter(
        (member) =>
          !["viewer", "admin"].includes(member.role) &&
          (!p.companyId ||
            !member.companyId ||
            p.companyId === member.companyId) &&
          (!p.domainId || !member.domainId || p.domainId === member.domainId),
      )
      .map((member) => member.email.toLowerCase()),
  );
  await db
    .insert(s.rhythmGroups)
    .values(
      unitRoles.map((role) => ({
        id: `role:${p.organizationId}:${p.userId}:${role.id}`,
        organizationId: p.organizationId,
        creatorId: p.userId,
        name: role.title,
        emails: members.filter(member=>eligible.has(member.email.toLowerCase())&&mentionsRole(member.name,role.title)).map(member=>member.email),
      })),
    )
    .onConflictDoNothing();
}
