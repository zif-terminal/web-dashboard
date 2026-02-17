import Link from "next/link";
import { PositionDetail } from "@/components/position-detail";
import { Button } from "@/components/ui/button";

interface PositionPageProps {
  params: Promise<{ id: string }>;
}

export default async function PositionPage({ params }: PositionPageProps) {
  const { id } = await params;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" asChild>
          <Link href="/positions">Back</Link>
        </Button>
        <div>
          <h1 className="text-xl md:text-3xl font-bold">Position Details</h1>
          <p className="text-muted-foreground">
            View the details of this closed position and its trades
          </p>
        </div>
      </div>
      <PositionDetail positionId={id} />
    </div>
  );
}
