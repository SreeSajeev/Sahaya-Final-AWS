/**
 * AssignmentConfirmDialog.tsx
 * 
 * Confirmation dialog shown when assigning a ticket to a Field Executive.
 * Shows a summary of the assignment and requires explicit confirmation.
 * 
 * Part of Requirement 3: Confirmation Pop-Ups When Assigning Tickets
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Truck, MapPin, Briefcase, User, Ticket } from 'lucide-react';
import { FieldExecutive, Ticket as TicketType } from '@/lib/types';
import { TicketNumberDisplay } from '@/components/common/TicketNumberDisplay';

interface AssignmentConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: TicketType;
  fieldExecutive: FieldExecutive & { locationMatch?: boolean; skillMatch?: boolean };
  isRecommended: boolean;
  onConfirm: () => void;
  isPending: boolean;
}

export function AssignmentConfirmDialog({
  open,
  onOpenChange,
  ticket,
  fieldExecutive,
  isRecommended,
  onConfirm,
  isPending,
}: AssignmentConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-full max-w-md max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            Confirm Assignment
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p>Please review and confirm the following assignment:</p>
              
              {/* Ticket Summary */}
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Ticket className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Ticket:</span>
                  <TicketNumberDisplay
                    ticketNumber={ticket.ticket_number}
                    organisationId={ticket.organisation_id}
                    variant="default"
                  />
                </div>
                {ticket.location && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Location:</span>
                    <span>{ticket.location}</span>
                  </div>
                )}
                {(ticket.issue_type || ticket.category) && (
                  <div className="flex items-center gap-2 text-sm">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Issue:</span>
                    <span>{ticket.issue_type || ticket.category}</span>
                  </div>
                )}
              </div>

              {/* FE Summary */}
              <div className="rounded-lg border bg-primary/5 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
                    {fieldExecutive.name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{fieldExecutive.name}</span>
                      {isRecommended && (
                        <Badge className="text-xs bg-primary/10 text-primary border-0">
                          Recommended
                        </Badge>
                      )}
                    </div>
                    {fieldExecutive.base_location && (
                      <p className="text-xs text-muted-foreground">
                        {fieldExecutive.base_location}
                      </p>
                    )}
                  </div>
                </div>
                
                {/* Match badges */}
                <div className="flex gap-2 flex-wrap">
                  {fieldExecutive.locationMatch && (
                    <Badge variant="outline" className="text-xs border-green-500 text-green-600">
                      <MapPin className="mr-1 h-3 w-3" />
                      Location Match
                    </Badge>
                  )}
                  {fieldExecutive.skillMatch && (
                    <Badge variant="outline" className="text-xs border-blue-500 text-blue-600">
                      <Briefcase className="mr-1 h-3 w-3" />
                      Skill Match
                    </Badge>
                  )}
                </div>
              </div>

            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isPending}
            className="bg-primary hover:bg-primary/90"
          >
            {isPending ? 'Assigning...' : 'Confirm Assignment'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
