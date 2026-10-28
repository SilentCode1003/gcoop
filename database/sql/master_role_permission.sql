create table master_role_permission(
mrp_id	INT AUTO_INCREMENT primary key,
mrp_role_id	INT NOT NULL,
mrp_route_id	INT NOT NULL,
mrp_permission	ENUM('view','write','all'),
mrp_create_at	DATETIME NOT NULL,
mrp_update_at	DATETIME,
foreign key (mrp_role_id) references master_roles(mr_id),
foreign key (mrp_route_id)references master_routes(mr_id)
);