import { z } from "zod";

/**
 * Contrato do endpoint POST /api/contact.
 * Validação sempre no servidor; o cliente só reaproveita o mesmo schema para feedback rápido.
 */
export const contactSchema = z
  .object({
    name: z.string().trim().min(2, "Informe seu nome.").max(80, "Nome muito longo."),
    email: z.email("E-mail inválido.").max(254),
    message: z
      .string()
      .trim()
      .min(10, "A mensagem precisa ter ao menos 10 caracteres.")
      .max(2000, "Mensagem muito longa."),
    // Honeypot anti-spam: campo invisível que humanos deixam vazio.
    website: z.string().max(0).optional(),
  })
  .strict();

export type ContactInput = z.infer<typeof contactSchema>;

export const CONTACT_MAX_BODY_BYTES = 8 * 1024;
