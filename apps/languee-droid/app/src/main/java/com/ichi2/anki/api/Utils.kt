/***************************************************************************************
 *                                                                                      *
 * Copyright (c) 2016 Timothy Rae <perceptualchaos2@gmail.com>                          *
 *                                                                                      *
 * This program is free software; you can redistribute it and/or modify it under        *
 * the terms of the GNU Lesser General Public License as published by the Free Software *
 * Foundation; either version 3 of the License, or (at your option) any later           *
 * version.                                                                             *
 *                                                                                      *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY      *
 * WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A      *
 * PARTICULAR PURPOSE. See the GNU General Public License for more details.             *
 *                                                                                      *
 * You should have received a copy of the GNU Lesser General Public License along with  *
 * this program.  If not, see <http://www.gnu.org/licenses/>.                           *
 ****************************************************************************************/
package com.ichi2.anki.api

import android.text.Html
import java.math.BigInteger
import java.security.MessageDigest
import java.util.regex.Pattern

internal object Utils {
    private val stylePattern = Pattern.compile("(?s)<style.*?>.*?</style>")
    private val scriptPattern = Pattern.compile("(?s)<script.*?>.*?</script>")
    private val tagPattern = Pattern.compile("<.*?>")
    private val imgPattern = Pattern.compile("<img src=[\"']?([^\"'>]+)[\"']? ?/?>")
    private val htmlEntitiesPattern = Pattern.compile("&#?\\w+;")
    private const val FIELD_SEPARATOR = ''.toString()

    fun joinFields(list: Array<String>?): String? = list?.joinToString(FIELD_SEPARATOR)

    fun splitFields(fields: String): Array<String> =
        fields.split(FIELD_SEPARATOR.toRegex()).dropLastWhile { it.isEmpty() }.toTypedArray()

    fun joinTags(tags: Set<String?>?): String {
        if (tags.isNullOrEmpty()) return ""
        for (t in tags) t!!.replace(" ".toRegex(), "_")
        return tags.joinToString(" ")
    }

    fun splitTags(tags: String): Array<String> =
        tags.trim { it <= ' ' }.split("\\s+".toRegex()).toTypedArray()

    fun fieldChecksum(data: String): Long {
        val strippedData = stripHTMLMedia(data)
        return try {
            val md = MessageDigest.getInstance("SHA1")
            val digest = md.digest(strippedData.toByteArray(charset("UTF-8")))
            val biginteger = BigInteger(1, digest)
            var result = biginteger.toString(16)
            if (result.length < 40) {
                val zeroes = "0000000000000000000000000000000000000000"
                result = zeroes.substring(0, zeroes.length - result.length) + result
            }
            java.lang.Long.valueOf(result.substring(0, 8), 16)
        } catch (e: Exception) {
            throw IllegalStateException("Error making field checksum with SHA1 algorithm and UTF-8 encoding", e)
        }
    }

    private fun stripHTMLMedia(s: String): String {
        val imgMatcher = imgPattern.matcher(s)
        return stripHTML(imgMatcher.replaceAll(" $1 "))
    }

    private fun stripHTML(s: String): String {
        var htmlMatcher = stylePattern.matcher(s)
        var strRep = htmlMatcher.replaceAll("")
        htmlMatcher = scriptPattern.matcher(strRep)
        strRep = htmlMatcher.replaceAll("")
        htmlMatcher = tagPattern.matcher(strRep)
        strRep = htmlMatcher.replaceAll("")
        return entsToTxt(strRep)
    }

    @Suppress("DEPRECATION")
    private fun entsToTxt(html: String): String {
        val htmlReplaced = html.replace("&nbsp;", " ")
        val htmlEntities = htmlEntitiesPattern.matcher(htmlReplaced)
        val sb = StringBuffer()
        while (htmlEntities.find()) {
            htmlEntities.appendReplacement(sb, Html.fromHtml(htmlEntities.group()).toString())
        }
        htmlEntities.appendTail(sb)
        return sb.toString()
    }
}
