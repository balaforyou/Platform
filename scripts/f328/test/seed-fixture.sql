-- Fixture for rehearsing wipe-jbc-guest-bookings.sql on a scratch DB (never run on dev/prod).
-- Tenants: jbc (2 branches) and other (1 branch). jbc has: a guest single booking, a guest chain
-- (parent + child, each with its own PaymentIntent), a member booking; other has a guest booking.
INSERT INTO "Tenant"(id,name,subdomain,"updatedAt") VALUES ('t-jbc','JBC','jbc',now()),('t-oth','Other','courtowner1',now());
INSERT INTO "Branch"(id,"tenantId",name,"updatedAt") VALUES ('b-old','t-jbc','Old',now()),('b-new','t-jbc','New',now()),('b-oth','t-oth','OthBranch',now());
INSERT INTO "ResourcePool"(id,"tenantId","branchId",name,"allocationMode","updatedAt") VALUES
 ('p-old','t-jbc','b-old','Old - Main','POOLED',now()),('p-new','t-jbc','b-new','New - Main','POOLED',now()),('p-oth','t-oth','b-oth','Oth - Main','POOLED',now());
INSERT INTO "AvailabilityWindow"(id,"resourcePoolId","startTime","endTime","updatedAt") VALUES
 ('w1','p-old',now(),now()+interval '1h',now()),('w2','p-old',now()+interval '1h',now()+interval '2h',now()),('w3','p-new',now(),now()+interval '1h',now()),('w4','p-oth',now(),now()+interval '1h',now());
INSERT INTO "User"(id,"tenantId","updatedAt") VALUES ('u1','t-jbc',now()),('u2','t-oth',now());
INSERT INTO "DeviceToken"(id,"userId",token,"updatedAt") VALUES ('d1','u1','tok1',now());
INSERT INTO "Booking"(id,"tenantId","branchId","resourcePoolId","windowId","userId",status,"heldUntil","isMemberBooking","parentBookingId","updatedAt") VALUES
 ('bk-single','t-jbc','b-old','p-old','w1','u1','CONFIRMED',now(),false,NULL,now()),
 ('bk-chain-parent','t-jbc','b-old','p-old','w1','u1','CONFIRMED',now(),false,NULL,now()),
 ('bk-member','t-jbc','b-new','p-new','w3','u1','CONFIRMED',now(),true,NULL,now()),
 ('bk-oth','t-oth','b-oth','p-oth','w4','u2','CONFIRMED',now(),false,NULL,now());
INSERT INTO "Booking"(id,"tenantId","branchId","resourcePoolId","windowId","userId",status,"heldUntil","isMemberBooking","parentBookingId","updatedAt") VALUES
 ('bk-chain-child','t-jbc','b-old','p-old','w2','u1','CONFIRMED',now(),false,'bk-chain-parent',now());
INSERT INTO "BookingPlayer"(id,"bookingId",phone,"updatedAt") VALUES ('bp1','bk-single','+911',now());
INSERT INTO "PaymentIntent"(id,"tenantId","userId",amount,purpose,"referenceId",status,"gatewayRef","updatedAt") VALUES
 ('pi-single','t-jbc','u1',40000,'guest_booking','bk-single','captured','g1',now()),
 ('pi-parent','t-jbc','u1',80000,'guest_booking','bk-chain-parent','captured','g2',now()),
 ('pi-child','t-jbc','u1',40000,'guest_booking','bk-chain-child','captured','g3',now()),
 ('pi-oth','t-oth','u2',40000,'guest_booking','bk-oth','captured','g4',now()),
 ('pi-sub','t-jbc','u1',9900,'subscription_billing','sub-1','captured','g5',now()),
 ('pi-orphan','t-jbc','u1',40000,'guest_booking','bk-gone','failed','g6',now());
INSERT INTO "Refund"(id,"paymentIntentId",amount,reason,status,"updatedAt") VALUES ('r1','pi-single',100,'x','processed',now());
INSERT INTO "NotificationRequest"(id,"tenantId",recipient,channel,"eventType",variables,status,"updatedAt") VALUES
 ('n1','t-jbc','u1','push','booking_confirmed','{"bookingId":"bk-single"}','sent',now()),
 ('n2','t-jbc','u1','push','guest_booking_reminder','{"bookingId":"bk-chain-parent"}','sent',now()),
 ('n3','t-jbc','u1','push','low_occupancy_alert','{"poolId":"p-old"}','sent',now()),
 ('n4','t-oth','u2','push','booking_confirmed','{"bookingId":"bk-oth"}','sent',now());
INSERT INTO "ScheduledJobDispatch"(id,"jobName","tenantId","subjectId","dedupKey","updatedAt") VALUES
 ('sd1','guest_booking_reminder','t-jbc','u1','bk-single',now()),          -- subjectId is the USER id
 ('sd2','guest_booking_reminder','t-jbc','u1','bk-member',now()),          -- kept: member booking
 ('sd3','payment_confirm_reconciliation','t-jbc','bk-single','pi-single',now()),
 ('sd4','slot_release_reminder','t-jbc','u1','asg:w1:x',now()),
 ('sd5','guest_booking_reminder','t-oth','u2','bk-oth',now());
