create table master_users(
mu_id	INT AUTO_INCREMENT primary key,
mu_fullname	VARCHAR(300) NOT NULL,
mu_role	INT NOT NULL,
mu_username	VARCHAR(300) NOT NULL,
mu_password	LONGTEXT NOT NULL,
mu_create_at	DATETIME NOT NULL,
mu_update_at	DATETIME,
foreign key(mu_role) references master_roles(mr_id)
);