import {
  Users, Stethoscope, GraduationCap, BriefcaseBusiness, House, Droplets, LifeBuoy, Landmark,
  FlaskConical, Handshake, MapPinned, ChartColumn, type LucideProps,
} from "lucide-react";
import type { IconName } from "@/content/en";

const map = {
  users: Users, stethoscope: Stethoscope, graduation: GraduationCap, briefcase: BriefcaseBusiness,
  home: House, droplets: Droplets, lifebuoy: LifeBuoy, landmark: Landmark, flask: FlaskConical,
  handshake: Handshake, map: MapPinned, chart: ChartColumn,
} satisfies Record<IconName, React.ComponentType<LucideProps>>;

/** Brand rule: Lucide line icons, 1.6 stroke, round ends. */
export function Icon({ name, ...props }: { name: IconName } & LucideProps) {
  const C = map[name];
  return <C strokeWidth={1.6} aria-hidden="true" {...props} />;
}
