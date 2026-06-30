import { cn } from "@/lib/utils";

type ListGroupProps = React.ComponentProps<"div"> & {
  inset?: boolean;
};

export function ListGroup({ inset = false, className, ...props }: ListGroupProps) {
  return (
    <div
      className={cn("ish-list-group", inset && "mx-4 lg:mx-0", className)}
      role="group"
      {...props}
    />
  );
}
