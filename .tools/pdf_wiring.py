import io

# module
p = "apps/api/src/modules/filing/filing.module.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
s = s.replace("""import { FilingController } from './filing.controller';""",
"""import { FilingController } from './filing.controller';
import { AnnexPdfService } from './annex-pdf.service';""")
s = s.replace("""  providers: [FilingService],""", """  providers: [FilingService, AnnexPdfService],""")
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))

# controller
p2 = "apps/api/src/modules/filing/filing.controller.ts"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
s2 = raw2.replace("\r\n", "\n")
s2 = s2.replace("""  BadRequestException,
  Req,
} from '@nestjs/common';
import { FilingService } from './filing.service';""",
"""  BadRequestException,
  Req,
  Res,
} from '@nestjs/common';
import { FilingService } from './filing.service';
import { AnnexPdfService } from './annex-pdf.service';""")

s2 = s2.replace("""import { FastifyRequest } from 'fastify';""",
"""import { FastifyRequest, FastifyReply } from 'fastify';""")

s2 = s2.replace("""  constructor(private readonly filingService: FilingService) {}""",
"""  constructor(
    private readonly filingService: FilingService,
    private readonly annexPdfService: AnnexPdfService,
  ) {}""")

s2 = s2.replace("""  @Get('assessment')""",
"""  @Get('filing-package/annexes.pdf')
  async downloadAnnexes(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { buffer, filename, annexCount } = await this.annexPdfService.buildForWorkspace(workspaceId);
    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .header('X-Annex-Count', String(annexCount))
      .send(buffer);
  }

  @Get('assessment')""")

io.open(p2, "w", encoding="utf-8", newline="").write(s2.replace("\n", "\r\n"))
print("ok")
