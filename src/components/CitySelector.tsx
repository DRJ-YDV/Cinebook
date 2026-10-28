import { MapPin } from "lucide-react";
import { useState } from "react";
import { CITIES } from "@/data/catalog";
import { useApp } from "@/lib/store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function CitySelector() {
  const { city, setCity } = useApp();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm transition hover:border-primary/60 hover:text-primary">
          <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
          <span className="max-w-24 truncate">{city}</span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Select your city</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CITIES.map((c) => (
            <button
              key={c}
              onClick={() => {
                setCity(c);
                setOpen(false);
              }}
              aria-pressed={c === city}
              className={`rounded-xl border px-3 py-3 text-sm transition ${
                c === city
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border hover:border-primary/50 hover:bg-surface-2"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Theatres and showtimes update based on the selected city.
        </p>
      </DialogContent>
    </Dialog>
  );
}
