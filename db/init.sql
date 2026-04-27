-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: localhost
-- Generation Time: Apr 20, 2026 at 08:14 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.0.30

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `braccialetto_sonno`
--

-- --------------------------------------------------------

--
-- Table structure for table `dati_sonno`
--

CREATE TABLE `dati_sonno` (
  `id` int(11) NOT NULL,
  `id_utente` int(11) NOT NULL,
  `tst` int(11) NOT NULL,
  `waso` int(11) NOT NULL,
  `se_efficienza` decimal(5,2) NOT NULL,
  `se_tempo_dormita` int(11) NOT NULL,
  `nRisvegli` int(11) NOT NULL,
  `daw` int(11) NOT NULL,
  `mi` decimal(5,2) NOT NULL,
  `ai` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `dati_sonno`
--

INSERT INTO `dati_sonno` (`id`, `id_utente`, `tst`, `waso`, `se_efficienza`, `se_tempo_dormita`, `nRisvegli`, `daw`, `mi`, `ai`) VALUES
(1, 5, 123, 12, 55.30, 1, 1, 1, 1.10, 1);

-- --------------------------------------------------------

--
-- Table structure for table `sistema_unita`
--

CREATE TABLE `sistema_unita` (
  `id` int(11) NOT NULL,
  `unita` varchar(20) CHARACTER SET utf8 COLLATE utf8_bin NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `sistema_unita`
--

INSERT INTO `sistema_unita` (`id`, `unita`) VALUES
(1, 'metrico'),
(2, 'imperiale');

-- --------------------------------------------------------

--
-- Table structure for table `utenti`
--

CREATE TABLE `utenti` (
  `nome` varchar(20) NOT NULL,
  `cognome` varchar(20) NOT NULL,
  `email` varchar(50) CHARACTER SET utf8 COLLATE utf8_bin NOT NULL,
  `id` int(11) NOT NULL,
  `password` varchar(255) CHARACTER SET utf8 COLLATE utf8_bin NOT NULL,
  `eta` int(11) DEFAULT NULL,
  `genere` varchar(20) DEFAULT NULL,
  `altezza` int(11) DEFAULT NULL,
  `peso` double DEFAULT NULL,
  `obbiettivo_sonno` int(11) DEFAULT NULL,
  `livello_attivita` varchar(20) DEFAULT NULL,
  `prob_sonno` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `utenti`
--

INSERT INTO `utenti` (`nome`, `cognome`, `email`, `id`, `password`, `eta`, `genere`, `altezza`, `peso`, `obbiettivo_sonno`, `livello_attivita`, `prob_sonno`) VALUES
('Luca', 'Travascio', 'l', 5, '$2b$12$NdzLtvMyrnmt9A.F2GjAbuqWDVfj9hAlS44Crz1lGytS0Pz96P2nS', 18, 'male', 185, 70, 8, 'sedentary', 'test'),
('Luca', 'Travascio', 'lucatraavscio08@gmail.com', 6, '$2b$12$i2Rx3A6xGDQDS24Zgu2dOeDrs7LtWefvu8e5ZFifjD1Iyico1tv.6', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('mattia', 'bertoletti', 'mattia', 12, '$2b$12$xtQs2l31PwwF3zK0mTWKeeIWAVsRWdhaiyTrLo4qMFY3GdEU4C41e', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('testreg', 'testreg', 'testreg', 16, '$2b$12$CW6DexkV0xbZ/YsTqcB6WeJfUTYM7gTMoX5tFNG0o/QijjyAnnGDW', NULL, NULL, NULL, NULL, NULL, NULL, NULL);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `dati_sonno`
--
ALTER TABLE `dati_sonno`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_id_utenti` (`id_utente`);

--
-- Indexes for table `sistema_unita`
--
ALTER TABLE `sistema_unita`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `utenti`
--
ALTER TABLE `utenti`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `dati_sonno`
--
ALTER TABLE `dati_sonno`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `sistema_unita`
--
ALTER TABLE `sistema_unita`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `utenti`
--
ALTER TABLE `utenti`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=18;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `dati_sonno`
--
ALTER TABLE `dati_sonno`
  ADD CONSTRAINT `fk_id_utenti` FOREIGN KEY (`id_utente`) REFERENCES `utenti` (`id`) ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
