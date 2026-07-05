import { NextRequest, NextResponse } from "next/server";
import { createStockProduct } from "@/lib/actions/stock";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const result = await createStockProduct(undefined, formData);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ 
      caughtError: error.message, 
      stack: error.stack 
    }, { status: 500 });
  }
}
