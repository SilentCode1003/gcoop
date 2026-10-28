create table master_members(
mm_id	INT AUTO_INCREMENT primary KEY,
mm_employee_id	VARCHAR(20) NOT NULL,
mm_fullname	VARCHAR(300) NOT NULL,
mm_address	LONGTEXT NOT NULL,
mm_contact_no	VARCHAR(13) NOT NULL,
mm_register_date	DATETIME,
mm_register_by	VARCHAR(300) NOT NULL
);