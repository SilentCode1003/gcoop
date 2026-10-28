create table master_denomination(
md_id	INT AUTO_INCREMENT primary key,
md_name	VARCHAR(300) NOT NULL,
md_value	INT NOT NULL,
md_create_at	DATETIME NOT NULL,
md_update_at	DATETIME
);