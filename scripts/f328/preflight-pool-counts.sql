-- READ-ONLY. Run before the production rename (F-329 guard): the rename script aborts unless every JBC
-- branch has exactly one pool, but look first so we never rename into a duplicate.
SELECT b.name AS branch, count(p.id) AS pools,
       count(p.id) FILTER (WHERE p.name ILIKE '%Main Courts%') AS pools_named_main_courts,
       string_agg(p.name, ' | ' ORDER BY p."createdAt") AS pool_names
  FROM "Branch" b LEFT JOIN "ResourcePool" p ON p."branchId" = b.id
 WHERE b."tenantId" = (SELECT id FROM "Tenant" WHERE subdomain = 'jbc')
 GROUP BY b.id, b.name ORDER BY b.name;
