import { z } from 'zod';

// Bounded private recovery metadata from the existing answer request. This is
// never executable UI, action authority or independent factual certification.
const kind = z.enum(['prose','cards','table','graph','steps','chart','calculator','metrics','tabs']);
export const responseCoverageContractSchema = z.object({
  version:z.literal('answer-coverage-v1'),
  plan:z.array(z.object({kind,heading:z.string().min(1).max(120).regex(/^[^\r\n]+$/),instruction:z.string().min(1).max(600),
    covers:z.array(z.string().min(1).max(80)).max(16).optional()}).strict()).max(8),
  requirements:z.array(z.object({id:z.string().min(1).max(80),description:z.string().min(1).max(400),
    sourceQuote:z.string().min(1).max(400).optional(),
    origin:z.enum(['requested','necessary-support']),formats:z.array(kind).min(1).max(3)}).strict()).max(16),
  coverage:z.object({complete:z.boolean(),issues:z.array(z.string().max(320)).max(256)}).strict(),
}).strict();
export type ResponseCoverageContract = z.infer<typeof responseCoverageContractSchema>;
