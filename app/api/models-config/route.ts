import { NextResponse } from "next/server";
import { invalidateModelsCache } from "@/lib/models-cache";
import { readModelsConfig, validateModelsConfig, writeModelsConfig, type ModelsFileConfig } from "@/lib/omp/models-config";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(readModelsConfig());
}

export async function PUT(req: Request) {
  try {
    const body = await req.json() as ModelsFileConfig;
    try {
      validateModelsConfig(body);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
    }
    writeModelsConfig(body);
    invalidateModelsCache();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
