import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { getCertificate, listCertificates } from "../certificates/service.ts";
import { db } from "../db/index.ts";
import { error, ErrorBody, secured } from "../lib/http.ts";
import { requireAuth } from "../plugins/auth.ts";

const CertificateDto = z.object({
  id: z.uuid(),
  courseId: z.string(),
  holderName: z.string(),
  certificateName: z.string(),
  courseTitle: z.string(),
  issuedAt: z.string(),
});
const toDto = (c: NonNullable<Awaited<ReturnType<typeof getCertificate>>>) => ({ ...c, issuedAt: c.issuedAt.toISOString() });

export const certificatesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/certificates",
    {
      onRequest: requireAuth,
      schema: { tags: ["certificates"], security: secured, response: { 200: z.array(CertificateDto) } },
    },
    async (req) => (await listCertificates(db, req.user.sub)).map(toDto),
  );

  // Public Verification link: no login. The unguessable id is the access control.
  app.get(
    "/certificates/:id",
    {
      schema: {
        tags: ["certificates"],
        params: z.object({ id: z.uuid() }),
        response: { 200: CertificateDto, 404: ErrorBody },
      },
    },
    async (req, reply) => {
      const cert = await getCertificate(db, req.params.id);
      if (!cert) return reply.code(404).send(error("Certificate not found"));
      return toDto(cert);
    },
  );
};
